from __future__ import annotations

import asyncio
import json
from collections import defaultdict, deque
from datetime import UTC, datetime
from itertools import count
from queue import Empty, Queue
from threading import Lock
from typing import Any


class CopilotEventStream:
    def __init__(self) -> None:
        self._lock = Lock()
        self._events: dict[str, deque[dict[str, Any]]] = defaultdict(lambda: deque(maxlen=400))
        self._subscribers: dict[str, dict[int, Queue]] = defaultdict(dict)
        self._sequence = count(1)
        self._subscriber_ids = count(1)

    def publish(self, session_id: str, event: dict[str, Any]) -> dict[str, Any]:
        payload = {
            "seq": next(self._sequence),
            "session_id": session_id,
            "timestamp": datetime.now(UTC).isoformat(),
            **event,
        }
        with self._lock:
            self._events[session_id].append(payload)
            subscribers = list(self._subscribers.get(session_id, {}).values())
        for queue in subscribers:
            queue.put(payload)
        return payload

    def subscribe(self, session_id: str) -> tuple[int, Queue, list[dict[str, Any]]]:
        subscriber_id = next(self._subscriber_ids)
        queue: Queue = Queue()
        with self._lock:
            self._subscribers[session_id][subscriber_id] = queue
            backlog = list(self._events.get(session_id, ()))
        return subscriber_id, queue, backlog

    def unsubscribe(self, session_id: str, subscriber_id: int) -> None:
        with self._lock:
            subscribers = self._subscribers.get(session_id)
            if not subscribers:
                return
            subscribers.pop(subscriber_id, None)
            if not subscribers:
                self._subscribers.pop(session_id, None)


copilot_stream = CopilotEventStream()


def publish_copilot_event(
    session_id: str,
    *,
    kind: str,
    message: str,
    detail: dict[str, Any] | None = None,
    status: str | None = None,
    level: str = "info",
) -> dict[str, Any]:
    return copilot_stream.publish(
        session_id,
        {
            "kind": kind,
            "message": message,
            "detail": detail or {},
            "status": status,
            "level": level,
        },
    )


async def stream_copilot_events(request, session_id: str):
    subscriber_id, queue, backlog = copilot_stream.subscribe(session_id)
    try:
        for event in backlog:
            yield _format_sse(event)
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(asyncio.to_thread(queue.get, True, 10), timeout=11)
            except (TimeoutError, Empty):
                yield ": keep-alive\n\n"
                continue
            yield _format_sse(event)
    finally:
        copilot_stream.unsubscribe(session_id, subscriber_id)


def _format_sse(event: dict[str, Any]) -> str:
    return f"id: {event['seq']}\nevent: copilot\ndata: {json.dumps(event)}\n\n"
