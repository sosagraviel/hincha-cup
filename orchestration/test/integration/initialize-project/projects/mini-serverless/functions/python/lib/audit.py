"""Audit-trail persistence — writes to Firestore."""
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from google.cloud import firestore


_client: firestore.Client | None = None


def _firestore_client() -> firestore.Client:
    """Lazy-initialise the firestore client so tests can patch it."""
    global _client
    if _client is None:
        _client = firestore.Client()
    return _client


def audit(event: str, user_id: str, payload: dict[str, Any]) -> str:
    """Write an audit record and return its document id.

    Args:
        event: e.g. "user.created", "billing.charged".
        user_id: the acting user.
        payload: free-form structured metadata.

    Returns:
        The Firestore document id.
    """
    record_id = uuid4().hex
    doc = {
        "event": event,
        "user_id": user_id,
        "payload": payload,
        "created_at": datetime.now(UTC).isoformat(),
    }
    _firestore_client().collection("audit").document(record_id).set(doc)
    return record_id
