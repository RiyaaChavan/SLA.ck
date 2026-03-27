from __future__ import annotations

import asyncio
import json
from collections import defaultdict, deque
from datetime import UTC, datetime
from itertools import count
from queue import Empty
from queue import Queue
from threading import Lock
from typing import Any


class ArtifactEventStream:
    def __init__(self) -> None:
        self._lock = Lock()
        self._events: dict[int, deque[dict[str, Any]]] = defaultdict(lambda: deque(maxlen=200))
        self._subscribers: dict[int, dict[int, Queue]] = defaultdict(dict)
        self._sequence = count(1)
        self._subscriber_ids = count(1)

    def publish(self, connector_id: int, event: dict[str, Any]) -> dict[str, Any]:
        payload = {
            "seq": next(self._sequence),
            "connector_id": connector_id,
            "timestamp": datetime.now(UTC).isoformat(),
            **event,
        }
        with self._lock:
            self._events[connector_id].append(payload)
            subscribers = list(self._subscribers.get(connector_id, {}).values())
        for queue in subscribers:
            queue.put(payload)
        return payload

    def subscribe(self, connector_id: int) -> tuple[int, Queue, list[dict[str, Any]]]:
        subscriber_id = next(self._subscriber_ids)
        queue: Queue = Queue()
        with self._lock:
            self._subscribers[connector_id][subscriber_id] = queue
            backlog = list(self._events.get(connector_id, ()))
        return subscriber_id, queue, backlog

    def unsubscribe(self, connector_id: int, subscriber_id: int) -> None:
        with self._lock:
            subscribers = self._subscribers.get(connector_id)
            if not subscribers:
                return
            subscribers.pop(subscriber_id, None)
            if not subscribers:
                self._subscribers.pop(connector_id, None)


artifact_stream = ArtifactEventStream()


def publish_artifact_event(
    connector_id: int,
    *,
    kind: str,
    message: str,
    stage: str | None = None,
    agent: str | None = None,
    status: str | None = None,
    level: str = "info",
    detail: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return artifact_stream.publish(
        connector_id,
        {
            "kind": kind,
            "message": message,
            "stage": stage,
            "agent": agent,
            "status": status,
            "level": level,
            "detail": detail or {},
        },
    )


async def stream_connector_events(request, connector_id: int):
    subscriber_id, queue, backlog = artifact_stream.subscribe(connector_id)
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
        artifact_stream.unsubscribe(connector_id, subscriber_id)


def _format_sse(event: dict[str, Any]) -> str:
    return f"id: {event['seq']}\nevent: artifact\ndata: {json.dumps(event)}\n\n"
