from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import (
    DashboardSpec,
    DataConnector,
    DetectorDefinition,
    DetectorRun,
    Organization,
)


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


def _schedule_bucket(minutes: int) -> str:
    if minutes <= 60:
        return "15-60 min"
    if minutes <= 240:
        return "1-4 hr"
    if minutes <= 720:
        return "4-12 hr"
    return "12-24 hr"


def _safe_number(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except Exception:
        return 0.0


def _build_binding_catalog(
    detectors: list[DetectorDefinition],
    latest_runs: dict[int, DetectorRun],
) -> tuple[dict[str, float], dict[str, list[dict[str, Any]]]]:
    preset_summaries = [
        {
            "name": detector.name,
            "module": detector.module,
            "validation_status": detector.validation_status,
            "schedule_minutes": detector.schedule_minutes,
            "latest_row_count": latest_runs[detector.id].row_count
            if detector.id in latest_runs
            else 0,
        }
        for detector in detectors
    ]

    latest_rows: list[dict[str, Any]] = []
    preset_row_counts: list[dict[str, Any]] = []
    module_preset_counter: Counter[str] = Counter()
    module_row_counter: defaultdict[str, int] = defaultdict(int)
    schedule_counter: Counter[str] = Counter()

    for detector in detectors:
        run = latest_runs.get(detector.id)
        row_count = run.row_count if run else 0
        module_preset_counter[detector.module] += 1
        module_row_counter[detector.module] += row_count
        schedule_counter[_schedule_bucket(detector.schedule_minutes)] += 1
        preset_row_counts.append(
            {
                "label": detector.name,
                "value": row_count,
                "module": detector.module,
                "validation_status": detector.validation_status,
            }
        )
        if run and run.sample_rows:
            for row in run.sample_rows[:5]:
                latest_rows.append({"detector": detector.name, **row})

    latest_rows = latest_rows[:10]
    validated_preset_count = sum(
        1 for detector in detectors if (detector.validation_status or "").lower() == "validated"
    )
    enabled_count = sum(1 for detector in detectors if detector.enabled)
    total_rows = sum(item["value"] for item in preset_row_counts)

    datasets: dict[str, list[dict[str, Any]]] = {
        "preset_summaries": preset_summaries,
        "latest_detector_rows": latest_rows,
        "module_preset_counts": [
            {"label": label, "value": value} for label, value in module_preset_counter.items()
        ],
        "module_row_rollup": [
            {"label": label, "value": value} for label, value in module_row_counter.items()
        ],
        "validation_overview": [
            {"label": "Validated", "value": validated_preset_count},
            {"label": "Needs review", "value": max(len(detectors) - validated_preset_count, 0)},
            {"label": "Enabled", "value": enabled_count},
        ],
        "schedule_distribution": [
            {"label": label, "value": value} for label, value in schedule_counter.items()
        ],
        "preset_row_counts": preset_row_counts,
    }
    metrics = {
        "preset_count": float(len(detectors)),
        "validated_preset_count": float(validated_preset_count),
        "latest_row_count": float(total_rows),
        "module_count": float(len(module_preset_counter)),
    }
    return metrics, datasets


def _compile_metric(
    op: dict[str, Any], metrics: dict[str, float], datasets: dict[str, list[dict[str, Any]]]
) -> dict[str, Any]:
    binding = str(op.get("binding") or "")
    value = metrics.get(binding)
    if value is None:
        value = float(len(datasets.get(binding, [])))
    return {
        "title": op.get("title", binding or "Metric"),
        "value": value,
        "value_format": op.get("value_format", "count"),
        "tone": op.get("tone", "neutral"),
    }


def _compile_widget(
    op: dict[str, Any], datasets: dict[str, list[dict[str, Any]]]
) -> dict[str, Any]:
    binding = str(op.get("binding") or "")
    dataset = datasets.get(binding, [])
    return {
        "kind": "chart"
        if op.get("op") == "add_chart"
        else op.get("op", "add_list").removeprefix("add_"),
        "title": op.get("title", binding or "Widget"),
        "subtitle": op.get("subtitle", ""),
        "empty_copy": op.get("empty_copy", "No data available."),
        "chart_type": op.get("chart_type"),
        "value_format": op.get("value_format", "count"),
        "items": dataset
        if isinstance(dataset, list) and (not dataset or "label" in dataset[0])
        else [],
        "rows": dataset
        if isinstance(dataset, list) and dataset and "label" not in dataset[0]
        else [],
    }


def _compile_dashboard_views(
    spec_json: dict[str, Any], metrics: dict[str, float], datasets: dict[str, list[dict[str, Any]]]
) -> list[dict[str, Any]]:
    raw_dashboards = spec_json.get("dashboards") or []
    compiled: list[dict[str, Any]] = []

    for index, dashboard in enumerate(raw_dashboards):
        operations = dashboard.get("operations") or []
        compiled_metrics = [
            _compile_metric(op, metrics, datasets)
            for op in operations
            if op.get("op") == "add_metric"
        ]
        compiled_widgets = [
            _compile_widget(op, datasets) for op in operations if op.get("op") != "add_metric"
        ]
        compiled.append(
            {
                "key": dashboard.get("key") or f"dashboard_{index + 1}",
                "title": dashboard.get("title", f"Dashboard {index + 1}"),
                "subtitle": dashboard.get("subtitle", ""),
                "layout": dashboard.get("layout", "grid"),
                "metrics": compiled_metrics,
                "widgets": compiled_widgets,
            }
        )

    if compiled:
        return compiled

    legacy_metrics = [
        {
            "title": item.get("title", item.get("binding", "Metric")),
            "value": metrics.get(
                str(item.get("binding") or ""),
                float(len(datasets.get(str(item.get("binding") or ""), []))),
            ),
            "value_format": item.get("value_format", "count"),
            "tone": item.get("tone", "neutral"),
        }
        for item in spec_json.get("metrics", [])
    ]
    legacy_widgets = [
        _compile_widget(
            {
                "op": f"add_{item.get('kind', 'list')}",
                "title": item.get("title"),
                "binding": item.get("binding"),
                "chart_type": item.get("chart_type") or item.get("type"),
                "subtitle": item.get("subtitle", ""),
                "empty_copy": item.get("empty_copy", "No data available."),
                "value_format": item.get("value_format", "count"),
            },
            datasets,
        )
        for item in spec_json.get("widgets", [])
    ]
    return [
        {
            "key": "overview",
            "title": spec_json.get("title", "Overview"),
            "subtitle": spec_json.get("subtitle", ""),
            "layout": "grid",
            "metrics": legacy_metrics,
            "widgets": legacy_widgets,
        }
    ]


def _build_default_dashboards(
    metrics: dict[str, float], datasets: dict[str, list[dict[str, Any]]]
) -> list[dict[str, Any]]:
    """Deterministic fallback dashboards when the spec is empty or too sparse."""
    overview_metrics = [
        {
            "title": "Total Presets",
            "value": metrics.get("preset_count", 0),
            "value_format": "count",
            "tone": "accent",
        },
        {
            "title": "Validated",
            "value": metrics.get("validated_preset_count", 0),
            "value_format": "count",
            "tone": "positive",
        },
        {
            "title": "Total Rows",
            "value": metrics.get("latest_row_count", 0),
            "value_format": "count",
            "tone": "neutral",
        },
        {
            "title": "Modules",
            "value": metrics.get("module_count", 0),
            "value_format": "count",
            "tone": "neutral",
        },
    ]
    overview_widgets = [
        _compile_widget(
            {
                "op": "add_chart",
                "title": "Presets by Module",
                "binding": "module_preset_counts",
                "chart_type": "bar",
                "value_format": "count",
                "empty_copy": "No modules detected.",
            },
            datasets,
        ),
        _compile_widget(
            {
                "op": "add_chart",
                "title": "Validation Status",
                "binding": "validation_overview",
                "chart_type": "pie",
                "value_format": "count",
                "empty_copy": "No validation data.",
            },
            datasets,
        ),
    ]
    operations_metrics = [
        {
            "title": "Total Rows",
            "value": metrics.get("latest_row_count", 0),
            "value_format": "count",
            "tone": "neutral",
        },
    ]
    operations_widgets = [
        _compile_widget(
            {
                "op": "add_chart",
                "title": "Schedule Cadence",
                "binding": "schedule_distribution",
                "chart_type": "pie",
                "value_format": "count",
                "empty_copy": "No schedule data.",
            },
            datasets,
        ),
        _compile_widget(
            {
                "op": "add_chart",
                "title": "Rows per Preset",
                "binding": "preset_row_counts",
                "chart_type": "bar",
                "value_format": "count",
                "empty_copy": "No row counts yet.",
            },
            datasets,
        ),
        _compile_widget(
            {
                "op": "add_list",
                "title": "Detector Inventory",
                "binding": "preset_summaries",
                "value_format": "count",
                "empty_copy": "No detectors configured.",
            },
            datasets,
        ),
    ]
    quality_widgets = [
        _compile_widget(
            {
                "op": "add_chart",
                "title": "Validation Overview",
                "binding": "validation_overview",
                "chart_type": "pie",
                "value_format": "count",
                "empty_copy": "No validation data.",
            },
            datasets,
        ),
        _compile_widget(
            {
                "op": "add_chart",
                "title": "Module Row Volume",
                "binding": "module_row_rollup",
                "chart_type": "bar",
                "value_format": "count",
                "empty_copy": "No module data.",
            },
            datasets,
        ),
        _compile_widget(
            {
                "op": "add_chart",
                "title": "Row Count per Detector",
                "binding": "preset_row_counts",
                "chart_type": "bar",
                "value_format": "count",
                "empty_copy": "No detector output.",
            },
            datasets,
        ),
    ]
    return [
        {
            "key": "overview",
            "title": "Overview",
            "subtitle": "Executive summary of detector inventory and output.",
            "layout": "grid",
            "metrics": overview_metrics,
            "widgets": overview_widgets,
        },
        {
            "key": "operations",
            "title": "Operations",
            "subtitle": "Detector scheduling, cadence, and live output volume.",
            "layout": "grid",
            "metrics": operations_metrics,
            "widgets": operations_widgets,
        },
        {
            "key": "quality",
            "title": "Quality & Coverage",
            "subtitle": "Validation status, module coverage, and detector health.",
            "layout": "grid",
            "metrics": [],
            "widgets": quality_widgets,
        },
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
            "theme_preset": "cobalt",
            "metrics": [],
            "widgets": [],
            "dashboards": [],
        }

    spec = db.scalar(
        select(DashboardSpec)
        .where(
            DashboardSpec.organization_id == organization_id,
            DashboardSpec.connector_id == connector.id,
        )
        .order_by(DashboardSpec.version.desc())
    )
    detectors = db.scalars(
        select(DetectorDefinition).where(
            DetectorDefinition.organization_id == organization_id,
            DetectorDefinition.connector_id == connector.id,
        )
    ).all()
    latest_runs = latest_runs_by_detector(db, organization_id)

    metrics, datasets = _build_binding_catalog(detectors, latest_runs)
    spec_json = spec.spec_json if spec is not None else {}
    dashboards = _compile_dashboard_views(spec_json, metrics, datasets)

    has_rich_dashboards = len(dashboards) >= 2 or any(
        len(d.get("widgets", [])) >= 2 for d in dashboards
    )
    if not has_rich_dashboards:
        dashboards = _build_default_dashboards(metrics, datasets)

    primary_dashboard = (
        dashboards[0]
        if dashboards
        else {
            "metrics": [],
            "widgets": [],
        }
    )

    return {
        "organization": {
            "id": organization.id,
            "name": organization.name,
            "industry": organization.industry,
            "geography": organization.geography,
        },
        "title": spec_json.get("title", f"{connector.name} dashboard"),
        "subtitle": spec_json.get(
            "subtitle", "Autogenerated from connector metadata and preset runs."
        ),
        "theme_preset": spec_json.get("theme_preset", "cobalt"),
        "metrics": primary_dashboard.get("metrics", []),
        "widgets": primary_dashboard.get("widgets", []),
        "dashboards": dashboards,
    }
