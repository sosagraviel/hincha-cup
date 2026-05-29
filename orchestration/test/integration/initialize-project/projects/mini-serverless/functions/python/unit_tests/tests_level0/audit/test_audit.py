"""Tests for lib.audit.audit — exercises the per-service test pattern."""
from unittest.mock import MagicMock, patch

from lib.audit import audit


def test_audit_writes_to_firestore():
    """audit() persists the record and returns the generated id."""
    fake_doc = MagicMock()
    fake_collection = MagicMock()
    fake_collection.document.return_value = fake_doc
    fake_client = MagicMock()
    fake_client.collection.return_value = fake_collection

    with patch("lib.audit._firestore_client", return_value=fake_client):
        record_id = audit("user.created", "u1", {"email": "a@b.co"})

    assert isinstance(record_id, str)
    assert fake_client.collection.call_args[0][0] == "audit"
    fake_doc.set.assert_called_once()


def test_audit_returns_hex_id():
    """The returned id is a 32-character hex (uuid4 default format)."""
    with patch("lib.audit._firestore_client") as mock_client:
        mock_client.return_value.collection.return_value.document.return_value = MagicMock()
        record_id = audit("ping", "u1", {})
    assert len(record_id) == 32
    assert all(c in "0123456789abcdef" for c in record_id)
