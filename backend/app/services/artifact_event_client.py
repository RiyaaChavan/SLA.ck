from __future__ import annotations

import json
from typing import Any
from urllib import request

from app.core.config import settings
from app.utils.logging import get_logger


logger = get_logger("app.artifact_event_client")


def emit_remote_artifact_event(
    connector_id: int,
    *,
    kind: str,
    message: str,
    stage: str | None = None,
    agent: str | None = None,
    status: str | None = None,
    level: str = "info",
    detail: dict[str, Any] | None = None,
) -> None:
    if not settings.artifact_event_callback_url:
        return
    payload = {
        "connector_id": connector_id,
        "kind": kind,
        "message": message,
        "stage": stage,
        "agent": agent,
        "status": status,
        "level": level,
        "detail": detail or {},
    }
    req = request.Request(
        url=settings.artifact_event_callback_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=2):
            return
    except Exception as exc:
        logger.debug(
            "artifact_event_emit_failed connector_id=%s stage=%s error=%s",
            connector_id,
            stage,
            exc.__class__.__name__,
        )
