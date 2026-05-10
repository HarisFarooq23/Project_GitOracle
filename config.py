import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


class Config:
    # Prefer DATABASE_URL if provided; fallback to local defaults used by DB scripts.
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:574209@127.0.0.1:5432/Git_Oracle",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.getenv("SECRET_KEY", "giki-secret-key")