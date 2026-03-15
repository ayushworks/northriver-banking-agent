"""Shared Firestore client singleton for all banking agents."""
from __future__ import annotations

import os

from google.cloud import firestore

_db: firestore.Client | None = None


def get_db() -> firestore.Client:
    """Return the shared Firestore client, initialising it on first call."""
    global _db
    if _db is None:
        project = os.getenv("FIRESTORE_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
        _db = firestore.Client(project=project)
    return _db
