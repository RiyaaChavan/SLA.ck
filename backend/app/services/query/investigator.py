from __future__ import annotations

import json
from typing import Any
from urllib import request

from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.connectors import get_connector_context, get_primary_connector


def _json_safe(value: Any) -> Any:
    return str(value)


def _post_a2a_json(base_url: str, task_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    req = request.Request(
        url=f"{base_url.rstrip('/')}/message/send",
        data=json.dumps(
            {
                "jsonrpc": "2.0",
                "id": f"{task_type}-{payload.get('connector', {}).get('id', 'n/a')}",
                "method": "message/send",
                "params": {"task_type": task_type, "payload": payload},
            },
            default=_json_safe,
        ).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=settings.agent_a2a_timeout_seconds) as response:
        body = json.loads(response.read().decode("utf-8"))
    result = body.get("result", {})
    if not isinstance(result, dict):
        raise RuntimeError(f"Unexpected A2A response for {task_type}")
    return result


def run_investigation(
    db: Session,
    *,
    organization_id: int,
    question: str,
    session_id: str | None = None,
) -> dict[str, Any]:
    connector = get_primary_connector(db, organization_id)
    if connector is None:
        raise ValueError("Connect a source before using copilot.")

    context = get_connector_context(db, connector.id)
    return _post_a2a_json(
        settings.sql_agent_a2a_url,
        "answer_question",
        {
            **context,
            "organization_id": organization_id,
            "question": question,
            "session_id": session_id,
        },
    )
