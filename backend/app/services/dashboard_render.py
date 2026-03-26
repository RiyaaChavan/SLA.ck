from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import DashboardSpec, DataConnector, DetectorDefinition, DetectorRun, Organization


def latest_runs_by_detector(db: Session, organization_id: int) -> dict[int, DetectorRun]:
    runs = db.scalars(
        select(DetectorRun)
        .where(DetectorRun.organization_id == organization_id)
        .order_by(DetectorRun.created_at.desc())
    ).all()
    latest: dict[int, DetectorRun] = {}
    for run in runs:
        latest.setdefault(run.detector_id, run)
    return latest


def list_detector_run_history(db: Session, detector_id: int) -> list[dict[str, Any]]:
    runs = db.scalars(
        select(DetectorRun)
        .where(DetectorRun.detector_id == detector_id)
        .order_by(DetectorRun.created_at.desc())
    ).all()
    return [
        {
            "id": run.id,
            "status": run.status,
            "started_at": run.started_at,
            "completed_at": run.completed_at,
            "row_count": run.row_count,
            "sample_rows": run.sample_rows,
            "summary": run.summary,
            "error": run.error,
        }
        for run in runs
    ]


def build_dashboard_render_payload(db: Session, organization_id: int) -> dict[str, Any]:
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise ValueError("Organization not found")
    connector = db.scalar(
        select(DataConnector)
        .where(DataConnector.organization_id == organization_id)
        .order_by(DataConnector.updated_at.desc())
    )
    if connector is None:
        return {
            "organization": {
                "id": organization.id,
                "name": organization.name,
                "industry": organization.industry,
                "geography": organization.geography,
            },
            "title": "No dashboard yet",
            "subtitle": "Connect a Postgres source to generate presets and dashboard widgets.",
            "metrics": [],
            "widgets": [],
        }
    spec = db.scalar(
        select(DashboardSpec)
        .where(DashboardSpec.organization_id == organization_id, DashboardSpec.connector_id == connector.id)
        .order_by(DashboardSpec.version.desc())
    )
    detectors = db.scalars(
        select(DetectorDefinition).where(
            DetectorDefinition.organization_id == organization_id,
            DetectorDefinition.connector_id == connector.id,
        )
    ).all()
    latest_runs = latest_runs_by_detector(db, organization_id)

    preset_summaries = [
        {
            "name": detector.name,
            "module": detector.module,
            "validation_status": detector.validation_status,
            "schedule_minutes": detector.schedule_minutes,
            "latest_row_count": latest_runs[detector.id].row_count if detector.id in latest_runs else 0,
        }
        for detector in detectors
    ]
    latest_rows: list[dict[str, Any]] = []
    for detector in detectors:
        run = latest_runs.get(detector.id)
        if run and run.sample_rows:
            for row in run.sample_rows[:5]:
                latest_rows.append({"detector": detector.name, **row})
    latest_rows = latest_rows[:10]
    total_rows = sum((latest_runs.get(detector.id).row_count if detector.id in latest_runs else 0) for detector in detectors)
    grouped_modules: dict[str, int] = defaultdict(int)
    for detector in detectors:
        grouped_modules[detector.module] += latest_runs.get(detector.id).row_count if detector.id in latest_runs else 0
    spec_json = spec.spec_json if spec is not None else {}
    metrics = []
    for item in spec_json.get("metrics", []):
        binding = item.get("binding")
        value = 0
        if binding == "relation_count":
            value = len(preset_summaries)
        elif binding == "preset_count":
            value = len(detectors)
        elif binding == "latest_row_count":
            value = total_rows
        metrics.append({"label": item.get("title", binding or "Metric"), "value": value})
    widgets = []
    for widget in spec_json.get("widgets", []):
        binding = widget.get("binding")
        payload: dict[str, Any] = {
            "kind": widget.get("kind", "list"),
            "title": widget.get("title", "Widget"),
            "empty_copy": widget.get("empty_copy", "No data available."),
        }
        if binding == "preset_summaries":
            payload["items"] = preset_summaries
        elif binding == "latest_detector_rows":
            payload["rows"] = latest_rows
        elif binding == "module_rollup":
            payload["items"] = [{"label": key, "value": value} for key, value in grouped_modules.items()]
        widgets.append(payload)
    return {
        "organization": {
            "id": organization.id,
            "name": organization.name,
            "industry": organization.industry,
            "geography": organization.geography,
        },
        "title": spec_json.get("title", f"{connector.name} dashboard"),
        "subtitle": spec_json.get("subtitle", "Autogenerated from connector metadata and preset runs."),
        "metrics": metrics,
        "widgets": widgets,
    }
