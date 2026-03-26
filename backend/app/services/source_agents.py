from __future__ import annotations

import json
from typing import Any

from sqlalchemy import create_engine, delete, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import ConnectedSource, SavedAnomalyQuery, SchemaMapping, SourceAgentMemory, SourceUpload
from app.services.ingestion.relational_source import import_quick_commerce_relational_source


def _table_name(source_name: str) -> str:
    return source_name.removesuffix(".csv")


def _quote_identifier(value: str) -> str:
    return f'"{value.replace("\"", "\"\"")}"'


def _fetch_preview_rows(database_url: str, schema_name: str, dataset_name: str, limit: int) -> list[dict[str, Any]]:
    engine = create_engine(database_url)
    try:
        table_name = _table_name(dataset_name)
        query = text(
            f"SELECT * FROM {_quote_identifier(schema_name)}.{_quote_identifier(table_name)} LIMIT :limit"
        )
        with engine.connect() as conn:
            rows = conn.execute(query, {"limit": limit}).mappings().all()
        return [dict(row) for row in rows]
    finally:
        engine.dispose()


def _build_datasets(db: Session, organization_id: int) -> tuple[ConnectedSource, list[dict[str, Any]]]:
    connected_source = db.scalars(
        select(ConnectedSource)
        .where(ConnectedSource.organization_id == organization_id)
        .order_by(ConnectedSource.id.desc())
    ).first()
    if connected_source is None:
        raise ValueError("No active connected source for this organization")

    uploads = db.scalars(
        select(SourceUpload)
        .where(SourceUpload.organization_id == organization_id, SourceUpload.source_kind == "relational_table")
        .order_by(SourceUpload.name.asc())
    ).all()
    mappings = db.scalars(
        select(SchemaMapping)
        .where(
            SchemaMapping.organization_id == organization_id,
            SchemaMapping.source_type == "relational_table",
        )
        .order_by(SchemaMapping.source_name.asc())
    ).all()
    mapping_by_name = {item.source_name: item for item in mappings}
    datasets = [
        {
            "name": upload.name,
            "record_count": upload.record_count,
            "columns": (mapping_by_name.get(upload.name).raw_schema or {}).get("columns", [])
            if mapping_by_name.get(upload.name)
            else [],
            "source_uri": connected_source.masked_uri,
            "schema": connected_source.schema_name,
        }
        for upload in uploads
    ]
    return connected_source, datasets


def _detect_anomaly_queries(datasets: list[dict[str, Any]], schema_name: str) -> list[dict[str, str]]:
    queries: list[dict[str, str]] = []
    by_name = {item["name"]: set(item["columns"]) for item in datasets}

    if {"invoice_ref", "billed_rate_inr", "contracted_rate_inr", "service_unit_count"}.issubset(
        by_name.get("invoices.csv", set())
    ):
        queries.append(
            {
                "name": "Contract rate drift",
                "category": "procurement",
                "description": "Invoices billed above the contracted rate.",
                "sql_text": (
                    f"SELECT invoice_ref, vendor_id, billed_rate_inr, contracted_rate_inr, "
                    f"(billed_rate_inr - contracted_rate_inr) * service_unit_count AS leakage_inr "
                    f"FROM {_quote_identifier(schema_name)}.{_quote_identifier('invoices')} "
                    f"WHERE CAST(billed_rate_inr AS DOUBLE PRECISION) > CAST(contracted_rate_inr AS DOUBLE PRECISION);"
                ),
            }
        )
    if {"invoice_ref", "service_unit_count", "validated_unit_count", "billed_rate_inr"}.issubset(
        by_name.get("invoices.csv", set())
    ):
        queries.append(
            {
                "name": "Billed vs validated mismatch",
                "category": "vendor_controls",
                "description": "Find invoices where billed service units exceed validated units.",
                "sql_text": (
                    f"SELECT invoice_ref, vendor_id, service_unit_count, validated_unit_count, "
                    f"(service_unit_count - validated_unit_count) * billed_rate_inr AS disputed_inr "
                    f"FROM {_quote_identifier(schema_name)}.{_quote_identifier('invoices')} "
                    f"WHERE CAST(service_unit_count AS DOUBLE PRECISION) > CAST(validated_unit_count AS DOUBLE PRECISION);"
                ),
            }
        )
    if {"status", "expected_by", "resolved_at", "backlog_hours"}.issubset(by_name.get("work_items.csv", set())):
        queries.append(
            {
                "name": "Open SLA breach risk",
                "category": "sla",
                "description": "Open work items that are unresolved and already in backlog.",
                "sql_text": (
                    f"SELECT work_item_id, team_id, item_type, expected_by, backlog_hours "
                    f"FROM {_quote_identifier(schema_name)}.{_quote_identifier('work_items')} "
                    f"WHERE status IN ('open', 'pending', 'active') "
                    f"AND COALESCE(NULLIF(backlog_hours, ''), '0')::DOUBLE PRECISION > 0;"
                ),
            }
        )
    if {"resource_type", "resource_name", "utilization_pct", "monthly_cost_inr"}.issubset(
        by_name.get("inventory_snapshots.csv", set())
    ):
        queries.append(
            {
                "name": "Resource underuse and overload",
                "category": "resource_optimization",
                "description": "Capacity rows that are materially underused or overloaded.",
                "sql_text": (
                    f"SELECT snapshot_id, store_id, resource_type, resource_name, utilization_pct, monthly_cost_inr "
                    f"FROM {_quote_identifier(schema_name)}.{_quote_identifier('inventory_snapshots')} "
                    f"WHERE COALESCE(NULLIF(utilization_pct, ''), '0')::DOUBLE PRECISION < 35 "
                    f"OR COALESCE(NULLIF(utilization_pct, ''), '0')::DOUBLE PRECISION > 110;"
                ),
            }
        )
    if {"promised_eta_minutes", "actual_delivery_minutes", "basket_value_inr"}.issubset(
        by_name.get("orders.csv", set())
    ):
        queries.append(
            {
                "name": "Late delivery clusters",
                "category": "delivery",
                "description": "Orders delivered materially later than promised ETA.",
                "sql_text": (
                    f"SELECT order_id, city_id, store_id, promised_eta_minutes, actual_delivery_minutes, basket_value_inr "
                    f"FROM {_quote_identifier(schema_name)}.{_quote_identifier('orders')} "
                    f"WHERE COALESCE(NULLIF(actual_delivery_minutes, ''), '0')::DOUBLE PRECISION "
                    f"> COALESCE(NULLIF(promised_eta_minutes, ''), '0')::DOUBLE PRECISION + 10;"
                ),
            }
        )
    return queries


def _fallback_memory(datasets: list[dict[str, Any]], schema_notes: str | None) -> tuple[str, str, list[dict[str, str]], str]:
    top_tables = ", ".join(f"{item['name']} ({item['record_count']:,} rows)" for item in datasets[:6])
    summary = (
        "This source looks like an operational commerce / supply chain warehouse.\n\n"
        f"Highest-signal tables: {top_tables}.\n\n"
        "Use invoices and contracts for commercial leakage, work_items for SLA risk, "
        "inventory_snapshots for capacity optimization, and orders plus delivery_events for service degradation."
    )
    if schema_notes:
        summary += f"\n\nAdditional schema notes:\n{schema_notes.strip()}"

    dashboard_brief = (
        "Primary dashboard sections:\n"
        "1. Leakage and penalty exposure\n"
        "2. Open SLA risk queues\n"
        "3. Resource underuse / overload by site and team\n"
        "4. Delivery delay and exception clusters\n"
        "5. Vendor mismatch and duplicate spend investigations"
    )
    anomaly_queries = _detect_anomaly_queries(datasets, datasets[0]["schema"] if datasets else "public")
    return summary, dashboard_brief, anomaly_queries, "deterministic-fallback"


def _langchain_memory(
    datasets: list[dict[str, Any]],
    schema_notes: str | None,
) -> tuple[str, str, list[dict[str, str]], str]:
    api_key = settings.google_api_key or settings.gemini_api_key
    if not api_key:
        return _fallback_memory(datasets, schema_notes)

    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
        from langchain_core.messages import HumanMessage
    except ImportError:
        return _fallback_memory(datasets, schema_notes)

    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=api_key,
        temperature=0,
    )
    payload = {
        "datasets": datasets,
        "schema_notes": schema_notes,
        "instructions": {
            "goal": "Generate a source memory summary, dashboard brief, and reusable anomaly SQL.",
            "output_format": {
                "summary_text": "string",
                "dashboard_brief": "string",
                "anomaly_queries": [
                    {"name": "string", "category": "string", "description": "string", "sql_text": "string"}
                ],
            },
        },
    }
    message = HumanMessage(
        content=(
            "You are a LangChain SQL agent planner for a SaaS anomaly platform. "
            "Return strict JSON only.\n"
            + json.dumps(payload)
        )
    )
    response = llm.invoke([message])
    try:
        parsed = json.loads(response.content)
        return (
            parsed["summary_text"],
            parsed["dashboard_brief"],
            parsed["anomaly_queries"],
            f"langchain:{settings.gemini_model}",
        )
    except Exception:
        return _fallback_memory(datasets, schema_notes)


def _write_memory_file(
    organization_id: int,
    source_uri: str,
    summary_text: str,
    dashboard_brief: str,
    anomaly_queries: list[dict[str, str]],
) -> str:
    settings.agent_memory_dir.mkdir(parents=True, exist_ok=True)
    path = settings.agent_memory_dir / f"organization_{organization_id}_source_memory.md"
    query_block = "\n\n".join(
        f"## {item['name']}\nCategory: {item['category']}\n\n{item['description']}\n\n```sql\n{item['sql_text']}\n```"
        for item in anomaly_queries
    )
    path.write_text(
        (
            f"# Source Memory\n\n"
            f"Source URI: `{source_uri}`\n\n"
            f"## Summary\n{summary_text}\n\n"
            f"## Dashboard Brief\n{dashboard_brief}\n\n"
            f"## Saved Anomaly Queries\n{query_block}\n"
        ),
        encoding="utf-8",
    )
    return str(path)


def generate_source_intelligence(
    db: Session,
    *,
    organization_id: int,
    schema_notes: str | None = None,
) -> SourceAgentMemory:
    connected_source, datasets = _build_datasets(db, organization_id)
    summary_text, dashboard_brief, anomaly_queries, engine_name = _langchain_memory(
        datasets, schema_notes
    )
    memory_path = _write_memory_file(
        organization_id,
        connected_source.masked_uri,
        summary_text,
        dashboard_brief,
        anomaly_queries,
    )

    db.execute(delete(SourceAgentMemory).where(SourceAgentMemory.organization_id == organization_id))
    db.execute(delete(SavedAnomalyQuery).where(SavedAnomalyQuery.organization_id == organization_id))
    db.flush()

    memory = SourceAgentMemory(
        organization_id=organization_id,
        connected_source_id=connected_source.id,
        source_kind=connected_source.source_kind,
        engine_name=engine_name,
        status="ready",
        schema_notes=schema_notes,
        summary_text=summary_text,
        dashboard_brief=dashboard_brief,
        memory_path=memory_path,
        context_snapshot={"datasets": datasets},
    )
    db.add(memory)
    db.flush()

    for item in anomaly_queries:
        db.add(
            SavedAnomalyQuery(
                organization_id=organization_id,
                connected_source_id=connected_source.id,
                name=item["name"],
                description=item["description"],
                sql_text=item["sql_text"],
                category=item["category"],
                enabled=True,
                source_kind="agent_generated",
            )
        )
    db.commit()
    db.refresh(memory)
    return memory


def connect_relational_source(
    db: Session,
    *,
    database_url: str,
    schema_name: str,
    reset: bool,
    schema_notes: str | None = None,
) -> dict[str, Any]:
    result = import_quick_commerce_relational_source(
        db,
        database_url=database_url,
        schema=schema_name,
        reset=reset,
    )
    memory = generate_source_intelligence(
        db, organization_id=result["organization_id"], schema_notes=schema_notes
    )
    return {
        "organization_id": result["organization_id"],
        "organization_name": result["organization_name"],
        "source_database": result["source_database"],
        "schema": result["schema"],
        "source_uploads_created": result["source_uploads_created"],
        "alerts_generated": result["alerts_generated"],
        "memory_path": memory.memory_path,
        "engine_name": memory.engine_name,
    }


def list_source_datasets(db: Session, organization_id: int) -> list[dict[str, Any]]:
    _connected_source, datasets = _build_datasets(db, organization_id)
    return datasets


def preview_source_dataset(
    db: Session, organization_id: int, dataset_name: str, limit: int = 25
) -> dict[str, Any]:
    connected_source, datasets = _build_datasets(db, organization_id)
    dataset = next((item for item in datasets if item["name"] == dataset_name), None)
    if dataset is None:
        raise ValueError("Dataset not found")
    rows = _fetch_preview_rows(
        connected_source.database_url,
        connected_source.schema_name,
        dataset_name,
        limit,
    )
    return {
        "name": dataset["name"],
        "columns": dataset["columns"],
        "rows": rows,
        "row_count": dataset["record_count"],
        "source_uri": connected_source.masked_uri,
        "schema": connected_source.schema_name,
    }


def get_source_agent_memory(db: Session, organization_id: int) -> dict[str, Any]:
    memory = db.scalars(
        select(SourceAgentMemory)
        .where(SourceAgentMemory.organization_id == organization_id)
        .order_by(SourceAgentMemory.id.desc())
    ).first()
    if memory is None:
        raise ValueError("No source memory available for this organization")
    return {
        "id": memory.id,
        "status": memory.status,
        "engine_name": memory.engine_name,
        "summary_text": memory.summary_text,
        "dashboard_brief": memory.dashboard_brief,
        "schema_notes": memory.schema_notes,
        "memory_path": memory.memory_path,
        "context_snapshot": memory.context_snapshot,
        "created_at": memory.created_at,
        "updated_at": memory.updated_at,
    }


def list_saved_anomaly_queries(db: Session, organization_id: int) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(SavedAnomalyQuery)
        .where(SavedAnomalyQuery.organization_id == organization_id)
        .order_by(SavedAnomalyQuery.id.asc())
    ).all()
    return [
        {
            "id": item.id,
            "name": item.name,
            "description": item.description,
            "sql_text": item.sql_text,
            "category": item.category,
            "enabled": item.enabled,
            "created_at": item.created_at,
        }
        for item in rows
    ]
