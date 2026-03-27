from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib import error, request

from sqlglot import exp, parse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import DashboardSpec, DetectorDefinition, DetectorRun, SourceAgentMemory
from app.services.artifact_stream import publish_artifact_event
from app.services.connectors import get_connector_context
from app.utils.logging import get_logger


FORBIDDEN_SQL_TOKENS = (
    "insert ",
    "update ",
    "delete ",
    "drop ",
    "alter ",
    "create ",
    "grant ",
    "truncate ",
    "comment ",
)
logger = get_logger("app.connector_artifacts")


def _json_safe(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def validate_generated_sql(sql_text: str) -> tuple[bool, str]:
    normalized = " ".join(sql_text.strip().split())
    lowered = normalized.lower()
    if not normalized:
        return False, "Empty SQL"
    if not (lowered.startswith("select ") or lowered.startswith("with ")):
        return False, "Only SELECT/WITH queries are allowed"
    if ";" in normalized.rstrip(";"):
        return False, "Multi-statement SQL is not allowed"
    if any(token in lowered for token in FORBIDDEN_SQL_TOKENS):
        return False, "Only read-only SQL is allowed"
    try:
        statements = parse(normalized, read="postgres")
    except Exception as exc:
        return False, f"Invalid SQL: {exc}"
    if len(statements) != 1:
        return False, "Multi-statement SQL is not allowed"
    statement = statements[0]
    if not isinstance(statement, (exp.Select, exp.Union, exp.Intersect, exp.Except)):
        return False, "Only SELECT/WITH queries are allowed"
    forbidden_nodes = (
        exp.Insert,
        exp.Update,
        exp.Delete,
        exp.Create,
        exp.Drop,
        exp.Alter,
        exp.Command,
    )
    if any(statement.find(node_type) is not None for node_type in forbidden_nodes):
        return False, "Only read-only SQL is allowed"
    return True, "validated"


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


def _relation_category(qualified_name: str) -> str:
    lowered = qualified_name.lower()
    if any(token in lowered for token in ("invoice", "vendor", "billing", "procure")):
        return "procurewatch"
    if any(token in lowered for token in ("ticket", "queue", "approval", "sla", "case")):
        return "sla_sentinel"
    return "resource_optimization"


def _fallback_sql_agent_payload(context: dict[str, Any]) -> dict[str, Any]:
    relations = context.get("relations", [])
    top_relations = relations[:6]
    relation_names = [item["qualified_name"] for item in top_relations]
    summary_text = (
        "Connected source exposes "
        f"{len(relations)} relations across {', '.join(context['connector'].get('schemas', ['public']))}. "
        f"Highest-signal relations: {', '.join(relation_names[:4]) or 'none yet'}."
    )
    dashboard_brief = (
        "Recommended dashboard should highlight recent anomaly rows, relation health, "
        "and top generated presets by latest row count."
    )
    schema_notes = (
        "This summary was generated from cached schema metadata and preview rows. "
        "Review read-only connection scopes before promoting new presets."
    )
    presets: list[dict[str, Any]] = []
    for relation in top_relations[:4]:
        columns = relation.get("schema_preview", [])
        if not columns:
            continue
        category = _relation_category(relation["qualified_name"])
        identifier = relation["qualified_name"].replace(".", "_")
        query = f'SELECT * FROM "{relation["schema"]}"."{relation["name"]}" LIMIT 100'
        presets.append(
            {
                "name": f"Inspect {relation['name']} anomalies",
                "description": f"Baseline inspection query for {relation['qualified_name']}.",
                "category": category,
                "sql_text": query,
                "schedule_minutes": 60,
                "expected_output_fields": columns[:6],
                "linked_action_template": "Review latest anomalous rows and assign an owner",
                "linked_cost_formula": f"Exposure = impacted rows sampled from {identifier}",
            }
        )
    return {
        "summary_text": summary_text,
        "dashboard_brief": dashboard_brief,
        "schema_notes": schema_notes,
        "presets": presets,
        "engine_name": "fallback-sql-agent",
    }


def _fallback_dashboard_payload(context: dict[str, Any]) -> dict[str, Any]:
    presets = context.get("presets", [])
    metrics = [
        {"kind": "stat", "title": "Connected relations", "binding": "relation_count"},
        {"kind": "stat", "title": "Generated presets", "binding": "preset_count"},
        {"kind": "stat", "title": "Latest anomaly rows", "binding": "latest_row_count"},
    ]
    widgets = [
        {
            "kind": "list",
            "title": "Generated anomaly presets",
            "binding": "preset_summaries",
            "empty_copy": "No presets generated yet.",
        },
        {
            "kind": "table",
            "title": "Latest detector sample rows",
            "binding": "latest_detector_rows",
            "empty_copy": "Preset runs have not produced rows yet.",
        },
    ]
    return {
        "title": f"{context['connector']['name']} dashboard",
        "subtitle": context.get("dashboard_brief")
        or "Autogenerated from connector metadata and latest preset runs.",
        "metrics": metrics,
        "widgets": widgets,
        "version": 1,
        "preset_count": len(presets),
    }


def _call_sql_agent(context: dict[str, Any]) -> dict[str, Any]:
    logger.info(
        "sql_agent_request connector_id=%s relation_count=%s",
        context.get("connector", {}).get("id"),
        len(context.get("relations", [])),
    )
    return _post_a2a_json(settings.sql_agent_a2a_url, "generate_sql_artifacts", context)


def _call_dashboard_agent(context: dict[str, Any]) -> dict[str, Any]:
    logger.info(
        "dashboard_agent_request connector_id=%s preset_count=%s",
        context.get("connector", {}).get("id"),
        len(context.get("presets", [])),
    )
    return _post_a2a_json(settings.dashboard_agent_a2a_url, "generate_dashboard_spec", context)


def _detector_fields_from_category(category: str) -> tuple[str, str, str]:
    normalized = category.lower()
    if normalized == "sla_sentinel":
        return "SLA Sentinel", "sla_operations", "high"
    if normalized == "resource_optimization":
        return "Resource Optimizer", "operations", "medium"
    return "ProcureWatch", "procurement", "high"


def persist_connector_artifacts(db: Session, connector_id: int) -> dict[str, Any]:
    logger.info("connector_artifacts_start connector_id=%s", connector_id)
    context = get_connector_context(db, connector_id)
    memory = db.scalar(
        select(SourceAgentMemory).where(SourceAgentMemory.connector_id == connector_id)
    )
    if memory is None:
        raise ValueError("Source memory row not initialized for connector")
    try:
        memory.status = "processing"
        db.commit()
        publish_artifact_event(
            connector_id,
            kind="status",
            stage="sql_agent",
            agent="sql_agent",
            status="running",
            message="SQL agent is generating source summary and presets.",
        )
        try:
            sql_payload = _call_sql_agent(context)
        except Exception as exc:
            logger.exception("sql_agent_request_failed connector_id=%s", connector_id)
            publish_artifact_event(
                connector_id,
                kind="status",
                stage="sql_agent",
                agent="sql_agent",
                status="error",
                level="error",
                message="SQL agent failed. Using fallback source intelligence.",
                detail={"error": str(exc)},
            )
            sql_payload = _fallback_sql_agent_payload(context)
        memory.status = "ready"
        memory.engine_name = sql_payload.get("engine_name", "sql-agent")
        memory.summary_text = sql_payload.get("summary_text", "")
        memory.dashboard_brief = sql_payload.get("dashboard_brief", "")
        memory.schema_notes = sql_payload.get("schema_notes", "")
        memory.raw_payload = sql_payload
        publish_artifact_event(
            connector_id,
            kind="status",
            stage="sql_agent",
            agent="sql_agent",
            status="completed",
            message="SQL agent finished and returned preset queries.",
            detail={"preset_count": len(sql_payload.get("presets", []))},
        )

        generated_detectors = db.scalars(
            select(DetectorDefinition).where(
                DetectorDefinition.connector_id == connector_id,
                DetectorDefinition.generation_source == "sql_agent",
            )
        ).all()
        generated_ids = [item.id for item in generated_detectors]
        if generated_ids:
            db.execute(delete(DetectorRun).where(DetectorRun.detector_id.in_(generated_ids)))
        db.execute(
            delete(DetectorDefinition).where(
                DetectorDefinition.connector_id == connector_id,
                DetectorDefinition.generation_source == "sql_agent",
            )
        )
        db.flush()

        presets = sql_payload.get("presets", [])
        for preset in presets:
            module, business_domain, severity = _detector_fields_from_category(
                preset.get("category", "procurewatch")
            )
            is_valid, validation_message = validate_generated_sql(preset.get("sql_text", ""))
            schedule_minutes = max(int(preset.get("schedule_minutes") or 60), 15)
            db.add(
                DetectorDefinition(
                    organization_id=memory.organization_id,
                    connector_id=connector_id,
                    detector_key=preset["name"].strip().lower().replace(" ", "_").replace("-", "_"),
                    name=preset["name"],
                    description=preset.get("description", preset["name"]),
                    module=module,
                    business_domain=business_domain,
                    severity=severity,
                    owner_name="SQL Agent",
                    enabled=is_valid,
                    logic_type="sql_agent_generated",
                    logic_summary=preset.get("description", preset["name"]),
                    query_logic=preset["sql_text"],
                    expected_output_fields=preset.get("expected_output_fields", []),
                    linked_action_template=preset.get("linked_action_template", "Review query results"),
                    linked_cost_formula=preset.get("linked_cost_formula", "Manual review required"),
                    schedule_minutes=schedule_minutes,
                    generation_source="sql_agent",
                    validation_status=validation_message,
                    next_run_at=datetime.now(UTC) + timedelta(minutes=schedule_minutes)
                    if is_valid
                    else None,
                )
            )

        db.flush()
        detector_rows = db.scalars(
            select(DetectorDefinition).where(
                DetectorDefinition.connector_id == connector_id,
                DetectorDefinition.generation_source == "sql_agent",
            )
        ).all()
        publish_artifact_event(
            connector_id,
            kind="status",
            stage="dashboard_agent",
            agent="dashboard_agent",
            status="running",
            message="Dashboard agent is generating the dashboard specification.",
            detail={"preset_count": len(detector_rows)},
        )
        dashboard_context = {
            **context,
            "summary_text": memory.summary_text,
            "dashboard_brief": memory.dashboard_brief,
            "schema_notes": memory.schema_notes,
            "presets": [
                {
                    "id": item.id,
                    "name": item.name,
                    "description": item.description,
                    "module": item.module,
                    "query_logic": item.query_logic,
                    "schedule_minutes": item.schedule_minutes,
                    "validation_status": item.validation_status,
                }
                for item in detector_rows
            ],
            "latest_runs": [],
        }
        try:
            dashboard_payload = _call_dashboard_agent(dashboard_context)
        except Exception as exc:
            logger.exception("dashboard_agent_request_failed connector_id=%s", connector_id)
            publish_artifact_event(
                connector_id,
                kind="status",
                stage="dashboard_agent",
                agent="dashboard_agent",
                status="error",
                level="error",
                message="Dashboard agent failed. Using fallback dashboard spec.",
                detail={"error": str(exc)},
            )
            dashboard_payload = _fallback_dashboard_payload(dashboard_context)
        spec = db.scalar(select(DashboardSpec).where(DashboardSpec.connector_id == connector_id))
        if spec is None:
            spec = DashboardSpec(
                organization_id=memory.organization_id,
                connector_id=connector_id,
                status="ready",
                spec_json=dashboard_payload,
                generated_at=datetime.now(UTC),
                version=1,
            )
            db.add(spec)
        else:
            spec.status = "ready"
            spec.spec_json = dashboard_payload
            spec.generated_at = datetime.now(UTC)
            spec.version += 1
        db.commit()
        publish_artifact_event(
            connector_id,
            kind="status",
            stage="dashboard_agent",
            agent="dashboard_agent",
            status="completed",
            message="Dashboard agent finished generating the dashboard spec.",
            detail={"dashboard_version": spec.version},
        )
        logger.info(
            "connector_artifacts_success connector_id=%s preset_count=%s dashboard_version=%s",
            connector_id,
            len(detector_rows),
            spec.version,
        )
        return {
            "memory_id": memory.id,
            "dashboard_spec_id": spec.id,
            "preset_count": len(detector_rows),
        }
    except Exception:
        db.rollback()
        memory = db.scalar(
            select(SourceAgentMemory).where(SourceAgentMemory.connector_id == connector_id)
        )
        if memory is not None:
            memory.status = "error"
            db.commit()
        raise
