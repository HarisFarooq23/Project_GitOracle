from datetime import datetime
from extensions import db
# =============================================================================
# LAYER 1: USER LAYER
# =============================================================================

class User(db.Model):
    __tablename__ = 'users'
    user_id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)

    # Relationships
    profile = db.relationship('UserProfile', backref='user', uselist=False, cascade="all, delete-orphan")
    skills = db.relationship('UserSkill', backref='user', cascade="all, delete-orphan")
    availability = db.relationship('UserAvailability', backref='user', cascade="all, delete-orphan")
    pic = db.relationship('UserPic', backref='user', uselist=False, cascade="all, delete-orphan")


class UserPic(db.Model):
    __tablename__ = 'user_pic'
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), primary_key=True)
    picture = db.Column(db.LargeBinary, nullable=False)


class UserProfile(db.Model):
    __tablename__ = 'user_profiles'
    profile_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), unique=True, nullable=False)
    full_name = db.Column(db.String(100))
    github_username = db.Column(db.String(50))
    experience_level = db.Column(db.String(20)) # beginner, intermediate, advanced, expert
    available_hours = db.Column(db.Numeric(4, 1))
    bio = db.Column(db.Text)
    avatar_path = db.Column(db.String(255))
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Skill(db.Model):
    __tablename__ = 'skills'
    skill_id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    category = db.Column(db.String(50))
    parent_id = db.Column(db.Integer, db.ForeignKey('skills.skill_id'))

class UserSkill(db.Model):
    __tablename__ = 'user_skills'
    user_skill_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    skill_id = db.Column(db.Integer, db.ForeignKey('skills.skill_id'), nullable=False)
    proficiency = db.Column(db.SmallInteger) # 1 to 5
    __table_args__ = (db.UniqueConstraint('user_id', 'skill_id', name='_user_skill_uc'),)

class UserAvailability(db.Model):
    __tablename__ = 'user_availability'
    availability_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    day_of_week = db.Column(db.String(10))
    hours_available = db.Column(db.Numeric(3, 1))

class UserActivity(db.Model):
    __tablename__ = 'user_activity'
    activity_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    entered_webapp_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    left_webapp_at = db.Column(db.DateTime, nullable=True)


class DeletedAccount(db.Model):
    __tablename__ = 'deleted_accounts'
    deleted_account_id = db.Column(db.Integer, primary_key=True)
    original_user_id = db.Column(db.Integer)
    username = db.Column(db.String(50), nullable=False)
    email = db.Column(db.String(100), nullable=False)
    deleted_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    reason = db.Column(db.String(255))


class WeeklyGoal(db.Model):
    __tablename__ = 'weekly_goals'
    weekly_goal_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    week_start_date = db.Column(db.Date, nullable=False)
    goal = db.Column(db.String(255), nullable=False)
    current_week_minutes = db.Column(db.Numeric(8, 2), nullable=False, default=0)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    __table_args__ = (
        db.UniqueConstraint('user_id', 'week_start_date', name='_weekly_goal_uc'),
        db.Index('idx_weekly_goals_user_week', 'user_id', 'week_start_date'),
    )

# =============================================================================
# LAYER 2: REPOSITORY LAYER
# =============================================================================

class Repository(db.Model):
    __tablename__ = 'repositories'
    repo_id = db.Column(db.Integer, primary_key=True)
    github_id = db.Column(db.BigInteger, unique=True, nullable=False)
    owner = db.Column(db.String(100), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    full_name = db.Column(db.String(200), unique=True, nullable=False)
    description = db.Column(db.Text)
    stars = db.Column(db.Integer, default=0)
    forks = db.Column(db.Integer, default=0)
    language = db.Column(db.String(50))
    html_url = db.Column(db.String(300))
    image_path = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class RepoTopic(db.Model):
    __tablename__ = 'repo_topics'
    topic_id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)

class RepositoryTopic(db.Model):
    __tablename__ = 'repository_topics'
    repo_id = db.Column(db.Integer, db.ForeignKey('repositories.repo_id', ondelete='CASCADE'), primary_key=True)
    topic_id = db.Column(db.Integer, db.ForeignKey('repo_topics.topic_id'), primary_key=True)

# =============================================================================
# LAYER 3: ISSUE LAYER
# =============================================================================

class Issue(db.Model):
    __tablename__ = 'issues'
    issue_id = db.Column(db.Integer, primary_key=True)
    github_issue_id = db.Column(db.BigInteger, unique=True, nullable=False)
    repo_id = db.Column(db.Integer, db.ForeignKey('repositories.repo_id'), nullable=False)
    title = db.Column(db.String(500), nullable=False)
    body = db.Column(db.Text)
    state = db.Column(db.String(20), default='open') # open, closed
    complexity_score = db.Column(db.Numeric(3, 1))
    estimated_time_hours = db.Column(db.Numeric(5, 1))
    github_url = db.Column(db.String(300))
    screenshot_path = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class IssueLabel(db.Model):
    __tablename__ = 'issue_labels'
    label_id = db.Column(db.Integer, primary_key=True)
    issue_id = db.Column(db.Integer, db.ForeignKey('issues.issue_id', ondelete='CASCADE'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    color = db.Column(db.String(10))
    __table_args__ = (db.UniqueConstraint('issue_id', 'name', name='_issue_label_uc'),)

class BountySkill(db.Model):
    __tablename__ = 'bounty_skills'
    bounty_skill_id = db.Column(db.Integer, primary_key=True)
    issue_id = db.Column(db.Integer, db.ForeignKey('issues.issue_id', ondelete='CASCADE'), nullable=False)
    skill_id = db.Column(db.Integer, db.ForeignKey('skills.skill_id'), nullable=False)
    required_level = db.Column(db.SmallInteger)
    __table_args__ = (db.UniqueConstraint('issue_id', 'skill_id', name='_bounty_skill_uc'),)

# =============================================================================
# LAYER 4: INTERACTION LAYER
# =============================================================================

class Assignment(db.Model):
    __tablename__ = 'assignments'
    assignment_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False)
    issue_id = db.Column(db.Integer, db.ForeignKey('issues.issue_id'), nullable=False)
    status = db.Column(db.String(20), default='claimed') # claimed, in_progress, completed, abandoned
    claimed_at = db.Column(db.DateTime, default=datetime.utcnow)
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)
    actual_hours = db.Column(db.Numeric(5, 1))
    __table_args__ = (db.UniqueConstraint('user_id', 'issue_id', name='_user_issue_assignment_uc'),)

class SavedRepository(db.Model):
    __tablename__ = 'saved_repositories'
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), primary_key=True)
    repo_id = db.Column(db.Integer, db.ForeignKey('repositories.repo_id'), primary_key=True)
    saved_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_completed = db.Column(db.Boolean, default=False, nullable=False)
    __table_args__ = (
        db.Index('idx_saved_user', 'user_id'),
        db.Index('idx_saved_repo', 'repo_id'),
        db.Index('idx_saved_user_repo', 'user_id', 'repo_id'),
    )

class UserActivityLog(db.Model):
    __tablename__ = 'user_activity_logs'
    log_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False)
    action = db.Column(db.String(100), nullable=False)
    entity = db.Column(db.String(50)) # issue, assignment, user
    entity_id = db.Column(db.Integer)
    logged_at = db.Column(db.DateTime, default=datetime.utcnow)

# =============================================================================
# LAYER 5: INTELLIGENCE LAYER
# =============================================================================

class Recommendation(db.Model):
    __tablename__ = 'recommendations'
    rec_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False)
    issue_id = db.Column(db.Integer, db.ForeignKey('issues.issue_id'), nullable=False)
    score = db.Column(db.Numeric(5, 2))
    reason = db.Column(db.Text)
    generated_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('user_id', 'issue_id', name='_user_issue_rec_uc'),)

class PredictionLog(db.Model):
    __tablename__ = 'prediction_logs'
    pred_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'))
    issue_id = db.Column(db.Integer, db.ForeignKey('issues.issue_id'))
    predicted_hours = db.Column(db.Numeric(5, 1))
    actual_hours = db.Column(db.Numeric(5, 1))
    error_margin = db.Column(db.Numeric(5, 2))
    logged_at = db.Column(db.DateTime, default=datetime.utcnow)

# =============================================================================
# LAYER 6: ARCHIVAL LAYER
# =============================================================================

class ArchiveIssue(db.Model):
    __tablename__ = 'archive_issues'
    archive_id = db.Column(db.Integer, primary_key=True)
    original_id = db.Column(db.Integer)
    data = db.Column(db.JSON) # PostgreSQL JSONB
    archived_at = db.Column(db.DateTime, default=datetime.utcnow)

class ArchiveAssignment(db.Model):
    __tablename__ = 'archive_assignments'
    archive_id = db.Column(db.Integer, primary_key=True)
    original_id = db.Column(db.Integer)
    data = db.Column(db.JSON)
    archived_at = db.Column(db.DateTime, default=datetime.utcnow)