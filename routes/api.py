from flask import Blueprint, current_app, jsonify, request
import csv
from pathlib import Path
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import Date, cast, func
from datetime import date, datetime, timedelta
from werkzeug.security import check_password_hash, generate_password_hash

from extensions import db

api_bp = Blueprint("api_bp", __name__)


def resolve_html_url(repo):
    html_url = (repo.html_url or "").strip() if repo.html_url else ""
    if html_url:
        return html_url
    owner = (repo.owner or "").strip() if repo.owner else ""
    name = (repo.name or "").strip() if repo.name else ""
    if owner and name:
        return f"https://github.com/{owner}/{name}"
    return None


def _topics_by_repo_id(repo_ids):
    if not repo_ids:
        return {}
    from models import RepoTopic, RepositoryTopic

    rows = (
        db.session.query(RepositoryTopic.repo_id, RepoTopic.name)
        .join(RepoTopic, RepoTopic.topic_id == RepositoryTopic.topic_id)
        .filter(RepositoryTopic.repo_id.in_(repo_ids))
        .all()
    )
    topics_map = {repo_id: [] for repo_id in repo_ids}
    for repo_id, topic_name in rows:
        topics_map.setdefault(repo_id, []).append(topic_name)
    for repo_id in topics_map:
        topics_map[repo_id] = sorted(set(t for t in topics_map[repo_id] if t))
    return topics_map


def _serialize_repository(repo, topics_map, difficulty_score=None):
    return {
        "repo_id": repo.repo_id,
        "github_id": repo.github_id,
        "owner": repo.owner,
        "name": repo.name,
        "full_name": repo.full_name,
        "description": repo.description,
        "stars": repo.stars,
        "forks": repo.forks,
        "language": repo.language,
        "topics": topics_map.get(repo.repo_id, []),
        "html_url": resolve_html_url(repo),
        "github_url": resolve_html_url(repo),
        "difficulty_score": difficulty_score,
        "created_at": repo.created_at.isoformat() if repo.created_at else None,
    }


def _extract_user_id_from_request():
    user_id = request.args.get("user_id", type=int)
    if user_id:
        return user_id

    header_user_id = request.headers.get("X-User-Id")
    if header_user_id:
        try:
            parsed = int(header_user_id)
            if parsed > 0:
                return parsed
        except ValueError:
            pass

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if token.isdigit():
            return int(token)

    payload = request.get_json(silent=True) or {}
    raw = payload.get("user_id")
    if raw is not None:
        try:
            parsed = int(raw)
            if parsed > 0:
                return parsed
        except (TypeError, ValueError):
            pass

    return None


def _is_admin_request() -> bool:
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.split(" ", 1)[1].strip() if auth_header.startswith("Bearer ") else ""
    return token.lower() == "haris"


def get_difficulty_limit(time_available):
    if time_available == "1-3":
        return 2
    if time_available == "5-10":
        return 4
    return 6


def _time_star_bounds(time_available):
    if time_available == "1-3":
        return {"max_stars": 2000, "min_stars": None}
    if time_available == "5-10":
        return {"max_stars": 10000, "min_stars": None}
    if time_available == "20+":
        return {"max_stars": None, "min_stars": 10000}
    return {"max_stars": None, "min_stars": None}


def _current_week_start_utc():
    today = datetime.utcnow().date()
    return today - timedelta(days=today.weekday())


def _current_week_minutes(user_id: int) -> float:
    from models import UserActivity

    week_start_date = _current_week_start_utc()
    week_start_dt = datetime.combine(week_start_date, datetime.min.time())
    seconds = (
        db.session.query(
            func.sum(
                func.extract(
                    "epoch",
                    func.coalesce(UserActivity.left_webapp_at, func.now()) - UserActivity.entered_webapp_at,
                )
            )
        )
        .filter(UserActivity.user_id == user_id)
        .filter(UserActivity.entered_webapp_at >= week_start_dt)
        .scalar()
    )
    return round(float(seconds or 0) / 60.0, 2)


def _topic_modifier(topic_names):
    if not topic_names:
        return 2
    modifiers = []
    for name in topic_names:
        lowered = (name or "").lower()
        if "good first issue" in lowered:
            modifiers.append(-2)
        elif "documentation" in lowered:
            modifiers.append(-1)
        elif "bug" in lowered:
            modifiers.append(1)
        elif "refactor" in lowered:
            modifiers.append(3)
        else:
            modifiers.append(2)
    return min(modifiers) if modifiers else 2


def _compute_difficulty_score(repo, topic_names):
    stars = repo.stars or 0
    if stars < 1000:
        stars_score = 1
    elif stars < 10000:
        stars_score = 2
    else:
        stars_score = 3
    return stars_score + _topic_modifier(topic_names)


def _normalize_skill_name(name):
    return (name or "").strip().lower()


def _auth_csv_path():
    return Path(__file__).resolve().parent.parent / "DBMS_database" / "auth_users.csv"


def _append_auth_user_csv(username, email, password, skills, role="user"):
    path = _auth_csv_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    file_exists = path.exists()
    with path.open("a", encoding="utf-8", newline="") as csv_file:
        writer = csv.writer(csv_file)
        if not file_exists or path.stat().st_size == 0:
            writer.writerow(
                ["username", "email", "password", "skills", "role", "saved_repo_ids", "completed_repo_ids"]
            )
        writer.writerow(
            [
                username,
                email,
                password,
                ",".join(skills),
                role,
                "",
                "",
            ]
        )


def _sync_user_repo_lists_to_csv(user_id):
    from models import SavedRepository, User

    user = User.query.filter_by(user_id=user_id).first()
    if not user:
        return

    saved_rows = SavedRepository.query.filter_by(user_id=user_id).all()
    saved_ids = sorted([row.repo_id for row in saved_rows if not row.is_completed])
    completed_ids = sorted([row.repo_id for row in saved_rows if row.is_completed])
    saved_serialized = ",".join(str(repo_id) for repo_id in saved_ids)
    completed_serialized = ",".join(str(repo_id) for repo_id in completed_ids)

    path = _auth_csv_path()
    if not path.exists():
        return

    with path.open("r", encoding="utf-8", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        fieldnames = reader.fieldnames or [
            "username",
            "email",
            "password",
            "skills",
            "role",
            "saved_repo_ids",
            "completed_repo_ids",
        ]
        rows = list(reader)

    updated = False
    for row in rows:
        row_username = (row.get("username") or "").strip().lower()
        row_email = (row.get("email") or "").strip().lower()
        if row_username == (user.username or "").strip().lower() or row_email == (user.email or "").strip().lower():
            row["saved_repo_ids"] = saved_serialized
            row["completed_repo_ids"] = completed_serialized
            updated = True
            break

    if not updated:
        rows.append(
            {
                "username": user.username or "",
                "email": user.email or "",
                "password": "",
                "skills": "",
                "role": "admin" if (user.username or "").lower() == "haris" else "user",
                "saved_repo_ids": saved_serialized,
                "completed_repo_ids": completed_serialized,
            }
        )

    with path.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


@api_bp.route("/users", methods=["GET"])
def get_users():
    from models import User

    users = User.query.order_by(User.created_at.desc()).limit(50).all()
    return jsonify(
        {
            "count": len(users),
            "users": [
                {
                    "user_id": user.user_id,
                    "username": user.username,
                    "email": user.email,
                    "is_active": user.is_active,
                    "created_at": user.created_at.isoformat() if user.created_at else None,
                }
                for user in users
            ],
        }
    )


@api_bp.route("/user/delete-account", methods=["POST"])
def delete_account():
    from models import DeletedAccount, User
    from firestore_user_sync import delete_firestore_user

    user_id = _extract_user_id_from_request()
    if user_id is None or user_id <= 0:
        return jsonify({"error": "Missing authenticated user context."}), 401

    payload = request.get_json(silent=True) or {}
    reason = str(payload.get("reason") or "").strip() or "User requested account deletion."

    user = User.query.filter_by(user_id=user_id).first()
    if not user:
        return jsonify({"error": "User not found."}), 404

    archived = DeletedAccount(
        original_user_id=user.user_id,
        username=user.username or "",
        email=user.email or "",
        reason=reason[:255],
    )
    db.session.add(archived)
    db.session.delete(user)
    db.session.commit()

    if not delete_firestore_user(user_id):
        current_app.logger.warning("PostgreSQL account deleted for user_id=%s but Firestore delete failed.", user_id)

    return jsonify({"message": "Account deleted successfully."})


@api_bp.route("/user/weekly-goal", methods=["GET", "POST"])
def user_weekly_goal():
    from models import WeeklyGoal

    user_id = _extract_user_id_from_request()
    if user_id is None or user_id <= 0:
        return jsonify({"error": "Missing authenticated user context."}), 401

    week_start_date = _current_week_start_utc()
    current_minutes = _current_week_minutes(user_id)
    row = WeeklyGoal.query.filter_by(user_id=user_id, week_start_date=week_start_date).first()

    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        goal = str(payload.get("goal") or "").strip()
        if not goal:
            return jsonify({"error": "goal is required."}), 400
        if len(goal) > 255:
            return jsonify({"error": "goal must be <= 255 characters."}), 400

        if row is None:
            row = WeeklyGoal(
                user_id=user_id,
                week_start_date=week_start_date,
                goal=goal,
                current_week_minutes=current_minutes,
            )
            db.session.add(row)
        else:
            row.goal = goal
            row.current_week_minutes = current_minutes

        db.session.commit()
        return jsonify(
            {
                "message": "Weekly goal saved.",
                "weekly_goal": {
                    "goal": row.goal,
                    "week_start_date": row.week_start_date.isoformat(),
                    "current_week_minutes": float(row.current_week_minutes or 0),
                    "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                },
            }
        )

    if row is not None:
        if float(row.current_week_minutes or 0) != current_minutes:
            row.current_week_minutes = current_minutes
            db.session.commit()
    return jsonify(
        {
            "weekly_goal": {
                "goal": row.goal if row else "",
                "week_start_date": week_start_date.isoformat(),
                "current_week_minutes": current_minutes,
                "updated_at": row.updated_at.isoformat() if row and row.updated_at else None,
            }
        }
    )


@api_bp.route("/auth/register", methods=["POST"])
def register_user():
    from models import Skill, User, UserSkill

    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username") or "").strip()
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")
    skills = payload.get("skills") if isinstance(payload.get("skills"), list) else []

    if not username or not email or not password:
        return jsonify({"error": "Username, email, and password are required."}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters long."}), 400

    username_exists = User.query.filter(User.username.ilike(username)).first()
    if username_exists:
        return jsonify({"error": "Username is already taken."}), 409

    email_exists = User.query.filter(User.email.ilike(email)).first()
    if email_exists:
        return jsonify({"error": "Email is already registered."}), 409

    password_hash = generate_password_hash(password)
    user = User(username=username, email=email, password_hash=password_hash)
    db.session.add(user)
    db.session.flush()

    normalized_input_skills = {
        _normalize_skill_name(skill_name)
        for skill_name in skills
        if isinstance(skill_name, str) and skill_name.strip()
    }
    if normalized_input_skills:
        existing_skills = Skill.query.filter(Skill.name.in_(list(skills))).all()
        existing_by_normalized = {_normalize_skill_name(skill.name): skill for skill in existing_skills}
        for normalized in normalized_input_skills:
            skill = existing_by_normalized.get(normalized)
            if skill is None:
                skill = Skill(name=normalized.title(), category="general")
                db.session.add(skill)
                db.session.flush()
            db.session.add(UserSkill(user_id=user.user_id, skill_id=skill.skill_id, proficiency=3))

    db.session.commit()

    db.session.refresh(user)
    from firestore_user_sync import sync_pg_user_model_to_firestore

    if not sync_pg_user_model_to_firestore(user):
        current_app.logger.warning(
            "User %s saved to PostgreSQL but Firestore sync failed or is not configured "
            "(check FIREBASE_CREDENTIALS_PATH in InternHub/.env and restart Flask).",
            user.user_id,
        )

    _append_auth_user_csv(username=username, email=email, password=password, skills=sorted(normalized_input_skills))
    return jsonify(
        {
            "message": "Account created successfully.",
            "user": {
                "user_id": user.user_id,
                "username": user.username,
                "email": user.email,
                "role": "user",
            },
        }
    ), 201


@api_bp.route("/auth/login", methods=["POST"])
def login_user():
    from models import User

    payload = request.get_json(silent=True) or {}
    username_or_email = str(payload.get("usernameOrEmail") or "").strip()
    password = str(payload.get("password") or "")
    admin_only = bool(payload.get("adminOnly"))

    if not username_or_email or not password:
        return jsonify({"error": "Username/email and password are required."}), 400

    # Built-in admin login used by the UI note.
    if username_or_email.lower() == "haris" and password == "gitoracle":
        return jsonify(
            {
                "message": "Login successful.",
                "user": {
                    "user_id": 0,
                    "username": "haris",
                    "email": "admin@internhub.local",
                    "role": "admin",
                },
            }
        )

    user = User.query.filter(
        (User.username.ilike(username_or_email)) | (User.email.ilike(username_or_email))
    ).first()
    if not user or not check_password_hash(user.password_hash or "", password):
        return jsonify({"error": "Invalid credentials."}), 401

    role = "user"
    if admin_only and role != "admin":
        return jsonify({"error": "Admin access denied."}), 403

    from firestore_user_sync import sync_pg_user_model_to_firestore

    if not sync_pg_user_model_to_firestore(user):
        current_app.logger.warning(
            "Login ok for user_id=%s but Firestore sync failed or is not configured.",
            user.user_id,
        )

    return jsonify(
        {
            "message": "Login successful.",
            "user": {
                "user_id": user.user_id,
                "username": user.username,
                "email": user.email,
                "role": role,
            },
        }
    )


@api_bp.route("/admin/overview", methods=["GET"])
def admin_overview():
    from models import Issue, Repository, SavedRepository, User

    if not _is_admin_request():
        return jsonify({"error": "Admin authorization required."}), 403

    total_users = db.session.query(func.count(User.user_id)).scalar() or 0
    total_repositories = db.session.query(func.count(Repository.repo_id)).scalar() or 0
    total_saved = db.session.query(func.count()).select_from(SavedRepository).scalar() or 0
    open_issues = (
        db.session.query(func.count(Issue.issue_id)).filter(Issue.state == "open").scalar() or 0
    )
    closed_issues = (
        db.session.query(func.count(Issue.issue_id)).filter(Issue.state == "closed").scalar() or 0
    )

    language_rows = (
        db.session.query(Repository.language, func.count(Repository.repo_id))
        .filter(Repository.language.isnot(None))
        .group_by(Repository.language)
        .order_by(func.count(Repository.repo_id).desc())
        .limit(8)
        .all()
    )

    top_repositories = (
        Repository.query.order_by(Repository.stars.desc()).limit(10).all()
    )

    newest_users = User.query.order_by(User.created_at.desc()).limit(8).all()

    return jsonify(
        {
            "summary": {
                "total_users": int(total_users),
                "total_repositories": int(total_repositories),
                "total_saved_projects": int(total_saved),
                "open_issues": int(open_issues),
                "closed_issues": int(closed_issues),
            },
            "languages": [
                {"name": language or "Unknown", "count": int(count)}
                for language, count in language_rows
            ],
            "top_repositories": [
                {
                    "repo_id": repo.repo_id,
                    "full_name": repo.full_name,
                    "language": repo.language,
                    "stars": repo.stars or 0,
                    "forks": repo.forks or 0,
                    "html_url": resolve_html_url(repo),
                }
                for repo in top_repositories
            ],
            "newest_users": [
                {
                    "user_id": user.user_id,
                    "username": user.username,
                    "email": user.email,
                    "created_at": user.created_at.isoformat() if user.created_at else None,
                }
                for user in newest_users
            ],
        }
    )


@api_bp.route("/admin/sync/postgres-to-firebase", methods=["POST"])
def sync_postgres_users_to_firestore():
    from models import User
    from firestore_user_sync import sync_all_pg_users_to_firestore

    if not _is_admin_request():
        return jsonify({"error": "Admin authorization required."}), 403

    users = User.query.order_by(User.user_id.asc()).all()
    result = sync_all_pg_users_to_firestore(users)
    return jsonify(
        {
            "message": "PostgreSQL users sync to Firestore completed.",
            "counts": result,
        }
    )


@api_bp.route("/admin/sync/firebase-to-postgres", methods=["POST"])
def sync_firestore_users_to_postgres():
    from models import User
    from firestore_user_sync import fetch_firestore_users

    if not _is_admin_request():
        return jsonify({"error": "Admin authorization required."}), 403

    firestore_users = fetch_firestore_users()
    created = 0
    updated = 0
    skipped = 0

    for row in firestore_users:
        username = (row.get("username") or "").strip()
        email = (row.get("email") or "").strip().lower()
        user_id = row.get("user_id")
        if not username or not email:
            skipped += 1
            continue

        existing = User.query.filter(
            (User.user_id == user_id)
            | (User.email.ilike(email))
            | (User.username.ilike(username))
        ).first()

        if existing is None:
            user = User(
                user_id=user_id,
                username=username,
                email=email,
                # Firestore never stores password_hash; set a random hash placeholder.
                password_hash=generate_password_hash(f"firebase-sync-{user_id}-{datetime.utcnow().isoformat()}"),
                is_active=bool(row.get("is_active", True)),
                created_at=row.get("created_at") or datetime.utcnow(),
            )
            db.session.add(user)
            created += 1
            continue

        changed = False
        if existing.username != username:
            existing.username = username
            changed = True
        if existing.email != email:
            existing.email = email
            changed = True
        incoming_active = bool(row.get("is_active", True))
        if bool(existing.is_active) != incoming_active:
            existing.is_active = incoming_active
            changed = True
        incoming_created_at = row.get("created_at")
        if incoming_created_at and existing.created_at is None:
            existing.created_at = incoming_created_at
            changed = True

        if changed:
            updated += 1
        else:
            skipped += 1

    db.session.commit()
    return jsonify(
        {
            "message": "Firestore users sync to PostgreSQL completed.",
            "counts": {
                "fetched": len(firestore_users),
                "created": created,
                "updated": updated,
                "skipped": skipped,
            },
        }
    )


@api_bp.route("/repositories", methods=["GET"])
def get_repositories():
    from models import Repository

    repositories = Repository.query.order_by(Repository.stars.desc()).limit(100).all()
    topics_map = _topics_by_repo_id([repo.repo_id for repo in repositories])
    return jsonify(
        {
            "count": len(repositories),
            "repositories": [_serialize_repository(repo, topics_map) for repo in repositories],
        }
    )


@api_bp.route("/issues", methods=["GET"])
def get_issues():
    from models import Issue

    issues = Issue.query.filter_by(state="open").order_by(Issue.created_at.desc()).limit(100).all()
    return jsonify(
        {
            "count": len(issues),
            "issues": [
                {
                    "issue_id": issue.issue_id,
                    "github_issue_id": issue.github_issue_id,
                    "repo_id": issue.repo_id,
                    "title": issue.title,
                    "body": issue.body,
                    "state": issue.state,
                    "complexity_score": float(issue.complexity_score)
                    if issue.complexity_score is not None
                    else None,
                    "estimated_time_hours": float(issue.estimated_time_hours)
                    if issue.estimated_time_hours is not None
                    else None,
                    "github_url": issue.github_url,
                    "created_at": issue.created_at.isoformat() if issue.created_at else None,
                    "updated_at": issue.updated_at.isoformat() if issue.updated_at else None,
                }
                for issue in issues
            ],
        }
    )


@api_bp.route("/saved-repos", methods=["GET"])
@api_bp.route("/saved-projects", methods=["GET"])
def get_saved_projects():
    from models import Repository, SavedRepository

    try:
        user_id = _extract_user_id_from_request()
        if user_id is None:
            return jsonify({
                "count": 0,
                "saved_projects": [],
                "error": "Missing authenticated user context.",
            }), 401

        rows = (
            db.session.query(
                Repository.repo_id,
                Repository.full_name,
                Repository.description,
                Repository.owner,
                Repository.language,
                Repository.stars,
                Repository.forks,
                Repository.html_url,
                SavedRepository.saved_at,
            )
            .join(SavedRepository, SavedRepository.repo_id == Repository.repo_id)
            .filter(SavedRepository.user_id == user_id)
            .filter(SavedRepository.is_completed.is_(False))
            .order_by(SavedRepository.saved_at.desc())
            .limit(50)
            .all()
        )

        saved_projects = [
            {
                "user_id": user_id,
                "repo_id": row.repo_id,
                "full_name": row.full_name,
                "description": row.description,
                "owner": row.owner,
                "language": row.language,
                "stars": row.stars,
                "forks": row.forks,
                "html_url": row.html_url,
                "saved_at": row.saved_at.isoformat() if row.saved_at else None,
            }
            for row in rows
        ]

        return jsonify({
            "count": len(rows),
            "saved_projects": saved_projects,
            "saved_repositories": saved_projects,
        })

    except Exception as e:
        return jsonify({
            "count": 0,
            "saved_projects": [],
            "error": str(e)
        }), 500


@api_bp.route("/completed-repos", methods=["GET"])
def get_completed_projects():
    from models import Repository, SavedRepository

    user_id = _extract_user_id_from_request()
    if user_id is None:
        return jsonify({"count": 0, "completed_projects": [], "error": "Missing authenticated user context."}), 401

    rows = (
        db.session.query(
            Repository.repo_id,
            Repository.full_name,
            Repository.description,
            Repository.owner,
            Repository.language,
            Repository.stars,
            Repository.forks,
            Repository.html_url,
            SavedRepository.saved_at,
        )
        .join(SavedRepository, SavedRepository.repo_id == Repository.repo_id)
        .filter(SavedRepository.user_id == user_id)
        .filter(SavedRepository.is_completed.is_(True))
        .order_by(SavedRepository.saved_at.desc())
        .limit(50)
        .all()
    )

    return jsonify(
        {
            "count": len(rows),
            "completed_projects": [
                {
                    "user_id": user_id,
                    "repo_id": row.repo_id,
                    "full_name": row.full_name,
                    "description": row.description,
                    "owner": row.owner,
                    "language": row.language,
                    "stars": row.stars,
                    "forks": row.forks,
                    "html_url": row.html_url,
                    "saved_at": row.saved_at.isoformat() if row.saved_at else None,
                }
                for row in rows
            ],
        }
    )


@api_bp.route("/saved-repos", methods=["POST"])
def save_repository():
    from models import Repository, SavedRepository

    payload = request.get_json(silent=True) or {}
    user_id = _extract_user_id_from_request() or payload.get("user_id")
    if user_id is None:
        return jsonify({"error": "Missing authenticated user context."}), 401
    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid user_id."}), 400

    repo_id = payload.get("repo_id")
    if repo_id is None:
        return jsonify({"error": "repo_id is required."}), 400

    repo = Repository.query.filter_by(repo_id=repo_id).first()
    if not repo:
        return jsonify({"error": "Repository not found."}), 404

    saved_row = SavedRepository.query.filter_by(user_id=user_id, repo_id=repo_id).first()
    if saved_row:
        saved_row.is_completed = False
        saved_row.saved_at = datetime.utcnow()
    else:
        saved_row = SavedRepository(user_id=user_id, repo_id=repo_id, is_completed=False)
        db.session.add(saved_row)

    db.session.commit()
    _sync_user_repo_lists_to_csv(user_id)
    return jsonify({"message": "Repository saved.", "repo_id": repo_id, "user_id": user_id})


@api_bp.route("/saved-repos/complete", methods=["POST"])
def complete_saved_repository():
    from models import SavedRepository

    payload = request.get_json(silent=True) or {}
    user_id = _extract_user_id_from_request() or payload.get("user_id")
    if user_id is None:
        return jsonify({"error": "Missing authenticated user context."}), 401
    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid user_id."}), 400

    repo_id = payload.get("repo_id")
    if repo_id is None:
        return jsonify({"error": "repo_id is required."}), 400

    saved_row = SavedRepository.query.filter_by(user_id=user_id, repo_id=repo_id).first()
    if not saved_row:
        return jsonify({"error": "Repository is not saved yet."}), 404

    saved_row.is_completed = True
    db.session.commit()
    _sync_user_repo_lists_to_csv(user_id)
    return jsonify({"message": "Repository marked as completed.", "repo_id": repo_id, "user_id": user_id})

@api_bp.route("/recommendations", methods=["GET"])
def get_recommendations():
    from models import Recommendation

    try:
        recommendations = Recommendation.query.order_by(Recommendation.score.desc()).limit(100).all()
    except SQLAlchemyError as error:
        return jsonify(
            {
                "count": 0,
                "recommendations": [],
                "warning": f"Recommendations unavailable: {str(error)}",
            }
        ), 200

    return jsonify(
        {
            "count": len(recommendations),
            "recommendations": [
                {
                    "rec_id": recommendation.rec_id,
                    "user_id": recommendation.user_id,
                    "issue_id": recommendation.issue_id,
                    "score": float(recommendation.score)
                    if recommendation.score is not None
                    else None,
                    "reason": recommendation.reason,
                    "generated_at": recommendation.generated_at.isoformat()
                    if recommendation.generated_at
                    else None,
                }
                for recommendation in recommendations
            ],
        }
    )


@api_bp.route("/user-activity/session/start", methods=["POST"])
def user_activity_session_start():
    """Record the user opening the webapp (one row per visit)."""
    from models import UserActivity

    user_id = _extract_user_id_from_request()
    payload = request.get_json(silent=True) or {}
    if user_id is None and payload.get("user_id") is not None:
        try:
            user_id = int(payload.get("user_id"))
        except (TypeError, ValueError):
            user_id = None

    if user_id is None or user_id <= 0:
        return jsonify({"error": "Missing authenticated user context."}), 401

    row = UserActivity(user_id=user_id, entered_webapp_at=datetime.utcnow(), left_webapp_at=None)
    db.session.add(row)
    db.session.commit()
    return jsonify(
        {
            "activity_id": row.activity_id,
            "user_id": row.user_id,
            "entered_webapp_at": row.entered_webapp_at.isoformat() if row.entered_webapp_at else None,
        }
    ), 201


@api_bp.route("/user-activity/session/end", methods=["POST"])
def user_activity_session_end():
    """Record the user leaving the webapp (sets left_webapp_at on the session row)."""
    from models import UserActivity

    user_id = _extract_user_id_from_request()
    payload = request.get_json(silent=True) or {}
    if user_id is None and payload.get("user_id") is not None:
        try:
            user_id = int(payload.get("user_id"))
        except (TypeError, ValueError):
            user_id = None

    if user_id is None or user_id <= 0:
        return jsonify({"error": "Missing authenticated user context."}), 401

    activity_id = payload.get("activity_id")
    if activity_id is None:
        return jsonify({"error": "activity_id is required."}), 400
    try:
        activity_id = int(activity_id)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid activity_id."}), 400

    row = UserActivity.query.filter_by(activity_id=activity_id, user_id=user_id).first()
    if not row:
        return jsonify({"error": "Activity session not found."}), 404

    if row.left_webapp_at is None:
        row.left_webapp_at = datetime.utcnow()
        db.session.commit()

    return jsonify(
        {
            "activity_id": row.activity_id,
            "left_webapp_at": row.left_webapp_at.isoformat() if row.left_webapp_at else None,
        }
    )


@api_bp.route("/user-activity/stats", methods=["GET", "POST"])
def user_activity_stats():
    """Minutes spent per calendar day (UTC) for the last 7 days, for the profile pie chart."""
    from models import UserActivity

    user_id = _extract_user_id_from_request()
    if user_id is None:
        return jsonify({"error": "Missing authenticated user context."}), 401
    if user_id <= 0:
        return jsonify({"days": [], "total_minutes": 0.0})

    today = datetime.utcnow().date()
    week_start = datetime.combine(today - timedelta(days=6), datetime.min.time())
    day_col = cast(UserActivity.entered_webapp_at, Date)
    duration_seconds = func.sum(
        func.extract(
            "epoch",
            func.coalesce(UserActivity.left_webapp_at, func.now()) - UserActivity.entered_webapp_at,
        )
    )

    rows = (
        db.session.query(day_col, duration_seconds)
        .filter(UserActivity.user_id == user_id)
        .filter(UserActivity.entered_webapp_at >= week_start)
        .group_by(day_col)
        .all()
    )
    by_day = {}
    for day_value, sec in rows:
        if day_value is None:
            continue
        if isinstance(day_value, datetime):
            dkey = day_value.date()
        elif isinstance(day_value, date):
            dkey = day_value
        else:
            continue
        by_day[dkey] = float(sec or 0) / 60.0

    weekday_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    out_days = []
    total = 0.0
    for i in range(7):
        d = today - timedelta(days=6 - i)
        minutes = round(by_day.get(d, 0.0), 2)
        total += minutes
        out_days.append(
            {
                "date": d.isoformat(),
                "weekday": weekday_names[d.weekday()],
                "minutes": minutes,
            }
        )

    return jsonify({"days": out_days, "total_minutes": round(total, 2)})


@api_bp.route("/search", methods=["GET", "POST"])
def search_repositories():
    from models import RepoTopic, Repository, RepositoryTopic

    payload = request.get_json(silent=True) if request.method == "POST" else None

    def _get_field(name, default=""):
        if payload and name in payload and payload.get(name) is not None:
            return str(payload.get(name)).strip()
        return request.args.get(name, default).strip()

    query = _get_field("keyword")
    if not query:
        query = _get_field("query")
    if not query:
        query = _get_field("q")

    language = _get_field("language")
    topic = _get_field("topic")
    time_available = _get_field("timeAvailable")

    stars_raw = None
    if payload and payload.get("stars") is not None:
        stars_raw = payload.get("stars")
    elif payload and payload.get("stars_gte") is not None:
        stars_raw = payload.get("stars_gte")
    elif request.args.get("stars_gte") is not None:
        stars_raw = request.args.get("stars_gte")
    elif request.args.get("min_stars") is not None:
        stars_raw = request.args.get("min_stars")

    stars_gte = None
    if stars_raw is not None and str(stars_raw).strip() != "":
        try:
            stars_gte = int(str(stars_raw).replace("+", "").strip())
        except ValueError:
            stars_gte = None

    sort = _get_field("sort", "stars").lower() or "stars"
    limit_raw = payload.get("limit") if payload and payload.get("limit") is not None else request.args.get("limit")
    try:
        limit = int(limit_raw) if limit_raw is not None else 20
    except ValueError:
        limit = 20
    limit = max(1, min(limit, 50))

    candidate_limit = 800
    q = Repository.query

    # STRUCTURED FILTERS FIRST (index-friendly)
    if language:
        q = q.filter(Repository.language.ilike(language))

    effective_min_stars = stars_gte if stars_gte is not None else 0
    time_bounds = _time_star_bounds(time_available)
    if time_bounds["min_stars"] is not None:
        effective_min_stars = max(effective_min_stars, time_bounds["min_stars"])
    q = q.filter(Repository.stars >= effective_min_stars)
    if time_bounds["max_stars"] is not None:
        q = q.filter(Repository.stars <= time_bounds["max_stars"])

    if sort == "stars":
        q = q.order_by(Repository.stars.desc())
    else:
        q = q.order_by(Repository.stars.desc())

    candidates = q.limit(candidate_limit).all()
    if not candidates:
        return jsonify({
            "count": 0,
            "time_available": time_available or None,
            "mode": "keyword" if query else "filtered",
            "results": [],
        })

    candidate_ids = [repo.repo_id for repo in candidates]

    # TOPIC MATCH ONLY WITHIN CANDIDATE WINDOW
    if topic:
        topic_rows = (
            db.session.query(RepositoryTopic.repo_id)
            .join(RepoTopic, RepoTopic.topic_id == RepositoryTopic.topic_id)
            .filter(
                RepositoryTopic.repo_id.in_(candidate_ids),
                RepoTopic.name.ilike(f"%{topic}%"),
            )
            .all()
        )
        matched_ids = {row[0] for row in topic_rows}
        candidates = [repo for repo in candidates if repo.repo_id in matched_ids]
        candidate_ids = [repo.repo_id for repo in candidates]

    # KEYWORD MATCH ON SMALL IN-MEMORY SET
    if query and candidates:
        lowered_query = query.lower()
        candidates = [
            repo
            for repo in candidates
            if lowered_query in (repo.full_name or "").lower()
            or lowered_query in (repo.description or "").lower()
        ]
        candidate_ids = [repo.repo_id for repo in candidates]

    topics_map = _topics_by_repo_id(candidate_ids)

    scored = []
    for repo in candidates:
        score = _compute_difficulty_score(repo, topics_map.get(repo.repo_id, []))
        scored.append((repo, score))

    if time_available:
        difficulty_limit = get_difficulty_limit(time_available)
        scored = [(repo, score) for repo, score in scored if score <= difficulty_limit]

    scored.sort(key=lambda item: (item[1], -(item[0].stars or 0)))
    rows = scored[:limit]
    repositories = [repo for repo, _ in rows]

    return jsonify({
        "count": len(repositories),
        "time_available": time_available or None,
        "mode": "keyword" if query else "filtered",
        "results": [
            _serialize_repository(
                repo,
                topics_map,
                difficulty_score=float(score) if score is not None else None,
            )
            for repo, score in rows
        ]
    })


@api_bp.route("/search/recommended-by-skills", methods=["GET"])
def recommended_repositories_by_skills():
    from models import RepoTopic, Repository, RepositoryTopic, Skill, UserSkill

    user_id = _extract_user_id_from_request()
    if user_id is None or user_id <= 0:
        return jsonify({"error": "Missing authenticated user context."}), 401

    skill_rows = (
        db.session.query(Skill.name)
        .join(UserSkill, UserSkill.skill_id == Skill.skill_id)
        .filter(UserSkill.user_id == user_id)
        .all()
    )
    user_skills = [str(name).strip().lower() for (name,) in skill_rows if name]

    candidates = Repository.query.order_by(Repository.stars.desc()).limit(250).all()
    if not candidates:
        return jsonify({"count": 0, "skills": user_skills, "fallback": True, "results": []})

    repo_ids = [repo.repo_id for repo in candidates]
    topic_rows = (
        db.session.query(RepositoryTopic.repo_id, RepoTopic.name)
        .join(RepoTopic, RepoTopic.topic_id == RepositoryTopic.topic_id)
        .filter(RepositoryTopic.repo_id.in_(repo_ids))
        .all()
    )
    topics_by_repo = {}
    for repo_id, topic_name in topic_rows:
        topics_by_repo.setdefault(repo_id, []).append((topic_name or "").strip().lower())

    def _repo_skill_score(repo):
        if not user_skills:
            return 0
        searchable_text = " ".join(
            [
                (repo.language or "").lower(),
                (repo.name or "").lower(),
                (repo.full_name or "").lower(),
                (repo.description or "").lower(),
                " ".join(topics_by_repo.get(repo.repo_id, [])),
            ]
        )
        return sum(1 for skill in user_skills if skill and skill in searchable_text)

    scored = []
    for repo in candidates:
        score = _repo_skill_score(repo)
        if user_skills and score <= 0:
            continue
        scored.append((repo, score))

    fallback = False
    if not scored:
        fallback = True
        scored = [(repo, 0) for repo in candidates[:20]]

    scored.sort(key=lambda row: (row[1], row[0].stars or 0), reverse=True)
    top_rows = scored[:20]
    top_repos = [repo for repo, _ in top_rows]
    topics_map = _topics_by_repo_id([repo.repo_id for repo in top_repos])

    return jsonify(
        {
            "count": len(top_repos),
            "skills": user_skills,
            "fallback": fallback,
            "results": [
                _serialize_repository(
                    repo,
                    topics_map,
                    difficulty_score=float(score) if score is not None else None,
                )
                for repo, score in top_rows
            ],
        }
    )
