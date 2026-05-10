"""
Mirror rows from the PostgreSQL `users` table into Firestore collection `users` only.

Configure one of:
  - FIREBASE_CREDENTIALS_PATH: path to the service-account JSON file
  - GOOGLE_APPLICATION_CREDENTIALS: same (Google-standard name)
    Relative paths are resolved against the InternHub folder (same directory as config.py).

  - FIREBASE_SERVICE_ACCOUNT_JSON: the full JSON object as a string (single line or use .env quoting)

Never writes password_hash or any other table's data.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from config import BASE_DIR

_logger = logging.getLogger(__name__)

_firestore_client: Optional[Any] = None
_init_attempted = False

COLLECTION = "users"


def _serialize_user_payload(user) -> dict[str, Any]:
    created = getattr(user, "created_at", None)
    return {
        "user_id": int(getattr(user, "user_id")),
        "username": getattr(user, "username", None) or "",
        "email": getattr(user, "email", None) or "",
        "is_active": bool(getattr(user, "is_active", True)),
        "created_at": created.isoformat() if created is not None else None,
    }


def _strip_env_value(raw: str) -> str:
    raw = raw.strip()
    if (raw.startswith('"') and raw.endswith('"')) or (raw.startswith("'") and raw.endswith("'")):
        raw = raw[1:-1]
    return raw.strip()


def _resolve_credentials_file_path(raw: str) -> Optional[Path]:
    if not raw:
        return None
    raw = _strip_env_value(raw)
    candidate = Path(raw)
    if not candidate.is_absolute():
        candidate = (BASE_DIR / candidate).resolve()
    else:
        candidate = candidate.resolve()
    return candidate if candidate.is_file() else None


def _credentials_path_from_env() -> Optional[Path]:
    raw_path = os.environ.get("FIREBASE_CREDENTIALS_PATH") or os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS"
    )
    if not raw_path:
        return None
    resolved = _resolve_credentials_file_path(raw_path)
    if resolved is None:
        attempted = _strip_env_value(raw_path)
        _logger.warning(
            "Firestore sync: credentials file not found. Looked at FIREBASE_CREDENTIALS_PATH="
            "'%s' (resolved from InternHub folder if relative): not a readable file.",
            attempted,
        )
    return resolved


def _certificate_from_inline_json() -> Optional[Any]:
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not raw:
        return None
    raw = raw.strip()
    if not raw:
        return None
    try:
        from firebase_admin import credentials

        data = json.loads(raw)
        if not isinstance(data, dict):
            _logger.warning("Firestore sync: FIREBASE_SERVICE_ACCOUNT_JSON is not a JSON object.")
            return None
        return credentials.Certificate(data)
    except json.JSONDecodeError as exc:
        _logger.warning("Firestore sync: FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON: %s", exc)
        return None
    except Exception as exc:  # pragma: no cover
        _logger.warning("Firestore sync: invalid FIREBASE_SERVICE_ACCOUNT_JSON: %s", exc)
        return None


def _certificate_from_file() -> Optional[Any]:
    path = _credentials_path_from_env()
    if path is None:
        return None
    try:
        from firebase_admin import credentials

        return credentials.Certificate(str(path))
    except Exception as exc:
        _logger.warning("Firestore sync: failed to load certificate from %s: %s", path, exc)
        return None


def _get_certificate():
    cert = _certificate_from_inline_json()
    if cert is not None:
        return cert
    return _certificate_from_file()


def warmup_firestore_client() -> None:
    """Eager-connect on Flask startup so missing credentials show in the logs immediately."""
    _get_firestore()


def _get_firestore():
    global _firestore_client, _init_attempted
    if _init_attempted:
        return _firestore_client
    _init_attempted = True

    cert = _get_certificate()
    if cert is None:
        _logger.warning(
            "Firestore user sync disabled: set FIREBASE_CREDENTIALS_PATH to your service-account "
            "JSON (path relative to InternHub/, e.g. secrets/firebase.json) "
            "or set FIREBASE_SERVICE_ACCOUNT_JSON.",
        )
        return None

    try:
        import firebase_admin
        from firebase_admin import firestore

        try:
            firebase_admin.get_app()
        except ValueError:
            firebase_admin.initialize_app(cert)
        _firestore_client = firestore.client()
        _logger.info("Firestore initialized; user rows will sync to collection %r.", COLLECTION)
        return _firestore_client
    except Exception as exc:
        _logger.exception("Firestore initialization failed: %s", exc)
        _firestore_client = None
        return None


def sync_pg_user_model_to_firestore(user) -> bool:
    """
    Upsert a SQLAlchemy User model into Firestore document users/{user_id}.

    Skips synthetic admin login (user_id 0) and missing users.

    Returns True if a document was written (or no-op skipped by design); False if Firestore
    is unavailable or the write failed.
    """
    if user is None:
        return True
    uid = getattr(user, "user_id", None)
    if uid is None or uid == 0:
        return True

    client = _get_firestore()
    if client is None:
        return False

    payload = _serialize_user_payload(user)

    try:
        client.collection(COLLECTION).document(str(uid)).set(payload, merge=True)
        _logger.info(
            "Firestore: upserted user document %s/%s",
            COLLECTION,
            uid,
        )
        return True
    except Exception:
        _logger.exception(
            "Failed to sync user %s to Firestore (%s/%s)",
            uid,
            COLLECTION,
            str(uid),
        )
        return False


def sync_all_pg_users_to_firestore(users) -> dict[str, int]:
    """
    Upsert all provided PostgreSQL users into Firestore `users` collection.

    Returns counts for attempted/succeeded/failed writes plus created/updated docs.
    """
    client = _get_firestore()
    if client is None:
        return {"attempted": 0, "succeeded": 0, "failed": 0}

    attempted = 0
    succeeded = 0
    created = 0
    updated = 0
    for user in users:
        uid = getattr(user, "user_id", None)
        if uid is None or uid == 0:
            continue
        attempted += 1
        try:
            doc_ref = client.collection(COLLECTION).document(str(uid))
            was_existing = doc_ref.get().exists
            doc_ref.set(_serialize_user_payload(user), merge=True)
            succeeded += 1
            if was_existing:
                updated += 1
            else:
                created += 1
        except Exception:
            _logger.exception("Failed bulk sync for PostgreSQL user_id=%s to Firestore.", uid)
    return {
        "attempted": attempted,
        "succeeded": succeeded,
        "failed": attempted - succeeded,
        "created": created,
        "updated": updated,
    }


def _parse_firestore_created_at(raw_value: Any) -> Optional[datetime]:
    if raw_value is None:
        return None
    if isinstance(raw_value, datetime):
        return raw_value
    if isinstance(raw_value, str):
        candidate = raw_value.strip()
        if candidate.endswith("Z"):
            candidate = candidate[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(candidate)
        except ValueError:
            return None
    return None


def fetch_firestore_users() -> list[dict[str, Any]]:
    """
    Read all documents from Firestore `users` collection into normalized rows.
    """
    client = _get_firestore()
    if client is None:
        return []

    rows: list[dict[str, Any]] = []
    for document in client.collection(COLLECTION).stream():
        data = document.to_dict() or {}
        user_id_raw = data.get("user_id")
        try:
            user_id = int(user_id_raw) if user_id_raw is not None else int(document.id)
        except (TypeError, ValueError):
            continue
        if user_id == 0:
            continue
        rows.append(
            {
                "user_id": user_id,
                "username": str(data.get("username") or "").strip(),
                "email": str(data.get("email") or "").strip().lower(),
                "is_active": bool(data.get("is_active", True)),
                "created_at": _parse_firestore_created_at(data.get("created_at")),
            }
        )
    return rows


def delete_firestore_user(user_id: int) -> bool:
    """Delete users/{user_id} from Firestore if initialized."""
    if not user_id or user_id <= 0:
        return True
    client = _get_firestore()
    if client is None:
        return False
    try:
        client.collection(COLLECTION).document(str(user_id)).delete()
        return True
    except Exception:
        _logger.exception("Failed to delete Firestore user document %s/%s", COLLECTION, user_id)
        return False
