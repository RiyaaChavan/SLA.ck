from __future__ import annotations

import json
from typing import Any
from urllib import request

from app.core.config import settings
from app.utils.logging import get_logger


logger = get_logger("app.copilot_event_client")


def emit_remote_copilot_event(
    session_id: str,
    *,
    kind: str,
    message: str,
    detail: dict[str, Any] | None = None,
    status: str | None = None,
    level: str = "info",
) -> None:
    if not settings.copilot_event_callback_url:
        return
    payload = {
        "session_id": session_id,
        "kind": kind,
        "message": message,
        "detail": detail or {},
        "status": status,
        "level": level,
    }
    req = request.Request(
        url=settings.copilot_event_callback_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=2):
            return
    except Exception as exc:
        logger.debug(
            "copilot_event_emit_failed session_id=%s error=%s",
            session_id,
            exc.__class__.__name__,
        )
