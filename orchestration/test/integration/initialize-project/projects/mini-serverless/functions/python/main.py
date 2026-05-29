"""GCP Cloud Functions Python entry point."""
from typing import Any

import functions_framework
from pydantic import BaseModel, ValidationError

from lib.audit import audit


class AuditRequest(BaseModel):
    event: str
    user_id: str
    payload: dict[str, Any] = {}


@functions_framework.http
def audit_handler(request) -> tuple[dict[str, Any], int]:
    """Persist an audit record. Idempotent by (event, user_id, payload-hash)."""
    try:
        body = AuditRequest.model_validate_json(request.get_data())
    except ValidationError as err:
        return {"error": err.errors()}, 400

    record_id = audit(body.event, body.user_id, body.payload)
    return {"ok": True, "recordId": record_id}, 201


@functions_framework.http
def healthcheck(_request) -> tuple[dict[str, Any], int]:
    """Lightweight liveness probe."""
    return {"ok": True}, 200
