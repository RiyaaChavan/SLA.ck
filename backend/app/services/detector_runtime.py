from __future__ import annotations

import asyncio
import logging
from contextlib import suppress
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import create_engine, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.domain import DataConnector, DetectorDefinition, DetectorRun
from app.services.agent_artifacts import validate_generated_sql
from app.services.connector_crypto import decrypt_connector_uri


logger = logging.getLogger(__name__)
_scheduler_task: asyncio.Task | None = None


def _set_read_only_session(connection) -> None:
    connection.execute(text("SET TRANSACTION READ ONLY"))
    connection.execute(
        text(f"SET LOCAL statement_timeout = {int(settings.source_query_statement_timeout_ms)}")
    )


def _sample_query(sql_text: str, limit: int = 50) -> str:
    return f"SELECT * FROM ({sql_text.rstrip().rstrip(';')}) AS anomaly_query LIMIT {int(limit)}"


def _count_query(sql_text: str) -> str:
    return f"SELECT COUNT(*) AS row_count FROM ({sql_text.rstrip().rstrip(';')}) AS anomaly_query"


def execute_detector_run(db: Session, detector_id: int) -> dict[str, Any]:
    detector = db.get(DetectorDefinition, detector_id)
    if detector is None:
        raise ValueError("Detector not found")
    if detector.connector_id is None:
        raise ValueError("Detector is not linked to a connector")
    connector = db.get(DataConnector, detector.connector_id)
    if connector is None:
        raise ValueError("Connector not found for detector")
    is_valid, validation_message = validate_generated_sql(detector.query_logic)
    run = DetectorRun(
        detector_id=detector.id,
        organization_id=detector.organization_id,
        connector_id=detector.connector_id,
        status="running",
        started_at=datetime.now(UTC),
        summary="",
    )
    db.add(run)
    db.flush()
    if not is_valid:
        run.status = "error"
        run.error = validation_message
        run.completed_at = datetime.now(UTC)
        detector.validation_status = validation_message
        detector.enabled = False
        detector.next_run_at = None
        db.commit()
        return {"run_id": run.id, "status": run.status, "row_count": 0}

    engine = create_engine(decrypt_connector_uri(connector.encrypted_uri), future=True, pool_pre_ping=True)
    try:
        with engine.begin() as connection:
            _set_read_only_session(connection)
            count = int(connection.execute(text(_count_query(detector.query_logic))).scalar() or 0)
            sample_rows = [
                dict(row)
                for row in connection.execute(text(_sample_query(detector.query_logic))).mappings().all()
            ]
        run.status = "success"
        run.row_count = count
        run.sample_rows = sample_rows
        run.summary = f"{count} rows matched {detector.name}."
        run.completed_at = datetime.now(UTC)
        detector.last_run_at = run.completed_at
        detector.last_triggered_at = run.completed_at
        detector.issue_count = count
        detector.validation_status = "validated"
        detector.next_run_at = run.completed_at + timedelta(minutes=max(detector.schedule_minutes, 15))
        db.commit()
        return {"run_id": run.id, "status": run.status, "row_count": count}
    except SQLAlchemyError as exc:
        run.status = "error"
        run.error = str(exc)
        run.completed_at = datetime.now(UTC)
        detector.validation_status = "runtime_error"
        detector.next_run_at = datetime.now(UTC) + timedelta(minutes=max(detector.schedule_minutes, 15))
        db.commit()
        return {"run_id": run.id, "status": run.status, "row_count": 0, "error": str(exc)}
    finally:
        engine.dispose()


def _tick_scheduler() -> None:
    with SessionLocal() as db:
        due_detectors = db.scalars(
            select(DetectorDefinition).where(
                DetectorDefinition.enabled.is_(True),
                DetectorDefinition.generation_source == "sql_agent",
                DetectorDefinition.next_run_at.is_not(None),
                DetectorDefinition.next_run_at <= datetime.now(UTC),
            )
        ).all()
        for detector in due_detectors:
            try:
                execute_detector_run(db, detector.id)
            except Exception:
                logger.exception("scheduled_detector_run_failed detector_id=%s", detector.id)


async def _scheduler_loop() -> None:
    while True:
        await asyncio.sleep(max(settings.scheduler_poll_seconds, 5))
        await asyncio.to_thread(_tick_scheduler)


def start_detector_scheduler() -> None:
    global _scheduler_task
    if _scheduler_task is None:
        _scheduler_task = asyncio.create_task(_scheduler_loop())


async def stop_detector_scheduler() -> None:
    global _scheduler_task
    if _scheduler_task is not None:
        _scheduler_task.cancel()
        with suppress(asyncio.CancelledError):
            await _scheduler_task
        _scheduler_task = None
