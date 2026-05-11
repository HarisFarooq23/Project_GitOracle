from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from config import BASE_DIR, Config

# Load .env from the backend folder regardless of cwd (e.g. Next.js repo root vs InternHub/).
load_dotenv(BASE_DIR / ".env")
from extensions import db, migrate
from routes.api import api_bp

# ----------------------------
# App Factory
# ----------------------------
def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app)

    # bind extensions
    db.init_app(app)
    migrate.init_app(app, db)

    # import models AFTER db init (IMPORTANT)
    with app.app_context():
        import models
        try:
            db.session.execute(
                text("CREATE INDEX IF NOT EXISTS idx_repo_language ON repositories(language)")
            )
            db.session.execute(
                text("CREATE INDEX IF NOT EXISTS idx_repo_stars ON repositories(stars)")
            )
            db.session.execute(
                text("CREATE INDEX IF NOT EXISTS idx_repo_topics_name ON repo_topics(name)")
            )
            db.session.execute(
                text("CREATE INDEX IF NOT EXISTS idx_repo_topics_repo_id ON repository_topics(repo_id)")
            )
            db.session.execute(
                text("CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_repositories(user_id)")
            )
            db.session.execute(
                text("CREATE INDEX IF NOT EXISTS idx_saved_repo ON saved_repositories(repo_id)")
            )
            db.session.execute(
                text("CREATE INDEX IF NOT EXISTS idx_saved_user_repo ON saved_repositories(user_id, repo_id)")
            )
            db.session.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS deleted_accounts (
                        deleted_account_id SERIAL PRIMARY KEY,
                        original_user_id INT,
                        username VARCHAR(50) NOT NULL,
                        email VARCHAR(100) NOT NULL,
                        deleted_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        reason VARCHAR(255)
                    )
                    """
                )
            )
            db.session.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS weekly_goals (
                        weekly_goal_id SERIAL PRIMARY KEY,
                        user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                        week_start_date DATE NOT NULL,
                        goal VARCHAR(255) NOT NULL,
                        current_week_minutes NUMERIC(8,2) NOT NULL DEFAULT 0,
                        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        UNIQUE(user_id, week_start_date)
                    )
                    """
                )
            )
            db.session.execute(
                text("CREATE INDEX IF NOT EXISTS idx_deleted_accounts_deleted_at ON deleted_accounts(deleted_at DESC)")
            )
            db.session.execute(
                text("CREATE INDEX IF NOT EXISTS idx_weekly_goals_user_week ON weekly_goals(user_id, week_start_date)")
            )
            db.session.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS user_pic (
                        user_id INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
                        picture BYTEA NOT NULL
                    )
                    """
                )
            )
            db.session.commit()
        except SQLAlchemyError:
            # Allow app startup during first-time migration bootstrap.
            db.session.rollback()
    app.register_blueprint(api_bp, url_prefix="/api")

    from firestore_user_sync import warmup_firestore_client

    warmup_firestore_client()

    return app


# ----------------------------
# RUN SERVER
# ----------------------------
if __name__ == '__main__':
    app = create_app()
    print("InternHub Backend Running on http://127.0.0.1:5000")
    app.run(debug=True)