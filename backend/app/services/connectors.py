from __future__ import annotations

from decimal import Decimal
from datetime import UTC, date, datetime, time
from typing import Any
from uuid import UUID

from sqlalchemy import create_engine, delete, func, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import (
    ConnectorColumn,
    ConnectorRelation,
    ConnectorRelationCache,
    DataConnector,
    Organization,
    SourceAgentMemory,
)
from app.services.connector_crypto import decrypt_connector_uri, encrypt_connector_uri
from app.utils.audit import log_event
from app.utils.logging import get_logger


POSTGRES_URI_PREFIXES = ("postgres://", "postgresql://", "postgresql+psycopg://")
logger = get_logger("app.connectors")


def _json_safe_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, dict):
        return {str(key): _json_safe_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe_value(item) for item in value]
    return str(value)


def _require_organization(db: Session, organization_id: int) -> Organization:
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise ValueError("Organization not found")
    return organization


def _validate_postgres_uri(uri: str) -> str:
    normalized = uri.strip()
    if not normalized:
        raise ValueError("Connection URI is required")
    if not normalized.startswith(POSTGRES_URI_PREFIXES):
        raise ValueError("Only Postgres connection URIs are supported in v1")
    return normalized


def _safe_relation_sql(schema_name: str, relation_name: str) -> str:
    safe_schema = schema_name.replace('"', '""')
    safe_relation = relation_name.replace('"', '""')
    return f'"{safe_schema}"."{safe_relation}"'


def _source_engine(uri: str) -> Engine:
    return create_engine(uri, future=True, pool_pre_ping=True)


def _set_read_only_session(connection) -> None:
    connection.execute(text("SET TRANSACTION READ ONLY"))
    connection.execute(
        text(f"SET LOCAL statement_timeout = {int(settings.source_query_statement_timeout_ms)}")
    )


def _relation_rows(connection, schemas: list[str]) -> list[dict[str, Any]]:
    rows = connection.execute(
        text(
            """
            SELECT
              ns.nspname AS schema_name,
              cls.relname AS relation_name,
              CASE cls.relkind
                WHEN 'r' THEN 'table'
                WHEN 'v' THEN 'view'
                WHEN 'm' THEN 'materialized_view'
                ELSE cls.relkind::text
              END AS relation_type,
              COALESCE(cls.reltuples, 0)::bigint AS row_estimate,
              COALESCE(pg_total_relation_size(cls.oid), 0)::bigint AS size_bytes
            FROM pg_class cls
            JOIN pg_namespace ns ON ns.oid = cls.relnamespace
            WHERE cls.relkind IN ('r', 'v', 'm')
              AND ns.nspname = ANY(:schemas)
              AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
            ORDER BY ns.nspname ASC, cls.relname ASC
            """
        ),
        {"schemas": schemas},
    ).mappings()
    return [dict(row) for row in rows]


def _column_rows(connection, schemas: list[str]) -> list[dict[str, Any]]:
    rows = connection.execute(
        text(
            """
            SELECT
              cols.table_schema AS schema_name,
              cols.table_name AS relation_name,
              cols.column_name,
              cols.ordinal_position,
              cols.data_type,
              cols.is_nullable = 'YES' AS is_nullable,
              cols.column_default,
              EXISTS (
                SELECT 1
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                 AND tc.table_name = kcu.table_name
                WHERE tc.constraint_type = 'PRIMARY KEY'
                  AND tc.table_schema = cols.table_schema
                  AND tc.table_name = cols.table_name
                  AND kcu.column_name = cols.column_name
              ) AS is_primary_key
            FROM information_schema.columns cols
            WHERE cols.table_schema = ANY(:schemas)
            ORDER BY cols.table_schema ASC, cols.table_name ASC, cols.ordinal_position ASC
            """
        ),
        {"schemas": schemas},
    ).mappings()
    return [dict(row) for row in rows]


def _column_stats(sample_rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    if not sample_rows:
        return {}
    columns = list(sample_rows[0].keys())
    stats: dict[str, dict[str, Any]] = {}
    for column in columns:
        values = [row.get(column) for row in sample_rows]
        non_null = [value for value in values if value is not None]
        distinct = {repr(value) for value in non_null[:25]}
        stats[column] = {
            "null_count": len(values) - len(non_null),
            "sample_type": type(non_null[0]).__name__ if non_null else "NoneType",
            "distinct_preview": list(distinct)[:10],
        }
    return stats


def _sample_rows(connection, schema_name: str, relation_name: str, limit: int = 50) -> list[dict[str, Any]]:
    relation_sql = _safe_relation_sql(schema_name, relation_name)
    query = text(f"SELECT * FROM {relation_sql} LIMIT {int(limit)}")
    result = connection.execute(query).mappings().all()
    return [_json_safe_value(dict(row)) for row in result]


def _introspect_postgres(uri: str, schemas: list[str]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, list[dict[str, Any]]], dict[str, dict[str, Any]], list[str]]:
    engine = _source_engine(uri)
    preview_rows: dict[str, list[dict[str, Any]]] = {}
    preview_stats: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []
    try:
        with engine.begin() as connection:
            _set_read_only_session(connection)
            relations = _relation_rows(connection, schemas)
            columns = _column_rows(connection, schemas)
            for relation in relations:
                qualified_name = f"{relation['schema_name']}.{relation['relation_name']}"
                try:
                    rows = _sample_rows(connection, relation["schema_name"], relation["relation_name"])
                    preview_rows[qualified_name] = rows
                    preview_stats[qualified_name] = _column_stats(rows)
                except SQLAlchemyError as exc:
                    preview_rows[qualified_name] = []
                    preview_stats[qualified_name] = {}
                    warnings.append(f"Preview unavailable for {qualified_name}: {exc.__class__.__name__}")
            return relations, columns, preview_rows, preview_stats, warnings
    finally:
        engine.dispose()


def _upsert_empty_memory(db: Session, organization_id: int, connector_id: int) -> None:
    memory = db.scalar(
        select(SourceAgentMemory).where(
            SourceAgentMemory.organization_id == organization_id,
            SourceAgentMemory.connector_id == connector_id,
        )
    )
    if memory is None:
        memory = SourceAgentMemory(
            organization_id=organization_id,
            connector_id=connector_id,
            status="pending",
            summary_text="",
            dashboard_brief="",
            schema_notes="",
            raw_payload={},
        )
        db.add(memory)


def _persist_connector_snapshot(
    db: Session,
    *,
    connector: DataConnector,
    relations: list[dict[str, Any]],
    columns: list[dict[str, Any]],
    preview_rows: dict[str, list[dict[str, Any]]],
    preview_stats: dict[str, dict[str, Any]],
) -> None:
    db.execute(delete(ConnectorRelationCache).where(ConnectorRelationCache.connector_id == connector.id))
    db.execute(delete(ConnectorColumn).where(ConnectorColumn.connector_id == connector.id))
    db.execute(delete(ConnectorRelation).where(ConnectorRelation.connector_id == connector.id))
    db.flush()

    relation_id_by_qualified_name: dict[str, int] = {}
    for relation in relations:
        qualified_name = f"{relation['schema_name']}.{relation['relation_name']}"
        relation_row = ConnectorRelation(
            connector_id=connector.id,
            organization_id=connector.organization_id,
            schema_name=relation["schema_name"],
            relation_name=relation["relation_name"],
            relation_type=relation["relation_type"],
            qualified_name=qualified_name,
            row_estimate=int(relation.get("row_estimate") or 0),
            size_bytes=int(relation.get("size_bytes") or 0),
            column_count=0,
            last_profiled_at=datetime.now(UTC),
        )
        db.add(relation_row)
        db.flush()
        relation_id_by_qualified_name[qualified_name] = relation_row.id

    for column in columns:
        qualified_name = f"{column['schema_name']}.{column['relation_name']}"
        relation_id = relation_id_by_qualified_name.get(qualified_name)
        if relation_id is None:
            continue
        db.add(
            ConnectorColumn(
                relation_id=relation_id,
                connector_id=connector.id,
                organization_id=connector.organization_id,
                schema_name=column["schema_name"],
                relation_name=column["relation_name"],
                column_name=column["column_name"],
                ordinal_position=int(column["ordinal_position"]),
                data_type=column["data_type"],
                is_nullable=bool(column["is_nullable"]),
                column_default=column["column_default"],
                is_primary_key=bool(column["is_primary_key"]),
            )
        )

    for qualified_name, relation_id in relation_id_by_qualified_name.items():
        sample = preview_rows.get(qualified_name, [])
        db.add(
            ConnectorRelationCache(
                relation_id=relation_id,
                connector_id=connector.id,
                organization_id=connector.organization_id,
                sample_rows=sample,
                column_stats=preview_stats.get(qualified_name, {}),
                preview_row_count=len(sample),
                refreshed_at=datetime.now(UTC),
            )
        )

    for relation_id in relation_id_by_qualified_name.values():
        column_count = db.scalar(
            select(func.count()).select_from(ConnectorColumn).where(ConnectorColumn.relation_id == relation_id)
        )
        relation = db.get(ConnectorRelation, relation_id)
        if relation is not None:
            relation.column_count = int(column_count or 0)


def list_connectors(db: Session, organization_id: int) -> list[dict[str, Any]]:
    _require_organization(db, organization_id)
    connectors = db.scalars(
        select(DataConnector)
        .where(DataConnector.organization_id == organization_id)
        .order_by(DataConnector.created_at.desc())
    ).all()
    return [
        {
            "id": item.id,
            "organization_id": item.organization_id,
            "name": item.name,
            "dialect": item.dialect,
            "status": item.status,
            "last_sync_at": item.last_sync_at,
            "last_error": item.last_error,
            "included_schemas": item.included_schemas or ["public"],
        }
        for item in connectors
    ]


def get_primary_connector(db: Session, organization_id: int) -> DataConnector | None:
    return db.scalar(
        select(DataConnector)
        .where(DataConnector.organization_id == organization_id)
        .order_by(DataConnector.updated_at.desc(), DataConnector.id.desc())
    )


def create_connector(
    db: Session,
    *,
    organization_id: int,
    name: str,
    uri: str,
    included_schemas: list[str] | None = None,
) -> dict[str, Any]:
    _require_organization(db, organization_id)
    normalized_uri = _validate_postgres_uri(uri)
    resolved_schemas = [schema.strip() for schema in (included_schemas or ["public"]) if schema.strip()] or ["public"]
    logger.info(
        "connector_create_start organization_id=%s name=%s schemas=%s",
        organization_id,
        name.strip() or "Postgres Connector",
        resolved_schemas,
    )
    connector = DataConnector(
        organization_id=organization_id,
        name=name.strip() or "Postgres Connector",
        dialect="postgres",
        encrypted_uri=encrypt_connector_uri(normalized_uri),
        status="pending",
        included_schemas=resolved_schemas,
    )
    db.add(connector)
    db.flush()
    _upsert_empty_memory(db, organization_id, connector.id)
    db.commit()
    logger.info(
        "connector_create_committed connector_id=%s organization_id=%s",
        connector.id,
        organization_id,
    )
    return refresh_connector(db, connector.id)


def update_connector(
    db: Session,
    *,
    connector_id: int,
    name: str | None = None,
    uri: str | None = None,
    included_schemas: list[str] | None = None,
) -> dict[str, Any]:
    connector = db.get(DataConnector, connector_id)
    if connector is None:
        raise ValueError("Connector not found")
    logger.info(
        "connector_update_start connector_id=%s organization_id=%s uri_supplied=%s schemas=%s",
        connector.id,
        connector.organization_id,
        uri is not None and bool(uri.strip()),
        included_schemas,
    )
    if name is not None:
        connector.name = name.strip() or connector.name
    if included_schemas is not None:
        connector.included_schemas = [schema.strip() for schema in included_schemas if schema.strip()] or ["public"]
    if uri is not None:
        connector.encrypted_uri = encrypt_connector_uri(_validate_postgres_uri(uri))
    connector.status = "pending"
    connector.last_error = None
    db.commit()
    logger.info(
        "connector_update_committed connector_id=%s organization_id=%s",
        connector.id,
        connector.organization_id,
    )
    return refresh_connector(db, connector.id)


def refresh_connector(db: Session, connector_id: int) -> dict[str, Any]:
    connector = db.get(DataConnector, connector_id)
    if connector is None:
        raise ValueError("Connector not found")
    decrypted_uri = decrypt_connector_uri(connector.encrypted_uri)
    logger.info(
        "connector_refresh_start connector_id=%s organization_id=%s schemas=%s",
        connector.id,
        connector.organization_id,
        connector.included_schemas or ["public"],
    )
    try:
        relations, columns, preview_rows, preview_stats, warnings = _introspect_postgres(
            decrypted_uri,
            connector.included_schemas or ["public"],
        )
        _persist_connector_snapshot(
            db,
            connector=connector,
            relations=relations,
            columns=columns,
            preview_rows=preview_rows,
            preview_stats=preview_stats,
        )
        connector.status = "ready"
        connector.last_sync_at = datetime.now(UTC)
        connector.last_error = "\n".join(warnings) if warnings else None
        _upsert_empty_memory(db, connector.organization_id, connector.id)
        log_event(
            db,
            organization_id=connector.organization_id,
            entity_type="connector",
            entity_id=connector.id,
            event_type="synced",
            payload={"relation_count": len(relations), "schemas": connector.included_schemas},
        )
        db.commit()
        logger.info(
            "connector_refresh_success connector_id=%s relation_count=%s column_count=%s warnings=%s",
            connector.id,
            len(relations),
            len(columns),
            len(warnings),
        )
    except Exception as exc:
        connector.status = "error"
        connector.last_error = str(exc)
        connector.last_sync_at = datetime.now(UTC)
        db.commit()
        logger.exception(
            "connector_refresh_failed connector_id=%s organization_id=%s error_type=%s",
            connector.id,
            connector.organization_id,
            exc.__class__.__name__,
        )
        raise
    return next(item for item in list_connectors(db, connector.organization_id) if item["id"] == connector.id)


def list_relation_summaries(db: Session, organization_id: int) -> list[dict[str, Any]]:
    connector = get_primary_connector(db, organization_id)
    if connector is None:
        return []
    relations = db.scalars(
        select(ConnectorRelation)
        .where(ConnectorRelation.organization_id == organization_id, ConnectorRelation.connector_id == connector.id)
        .order_by(ConnectorRelation.schema_name.asc(), ConnectorRelation.relation_name.asc())
    ).all()
    caches = {
        item.relation_id: item
        for item in db.scalars(
            select(ConnectorRelationCache).where(
                ConnectorRelationCache.organization_id == organization_id,
                ConnectorRelationCache.connector_id == connector.id,
            )
        ).all()
    }
    columns = db.scalars(
        select(ConnectorColumn).where(
            ConnectorColumn.organization_id == organization_id,
            ConnectorColumn.connector_id == connector.id,
        )
    ).all()
    columns_by_relation: dict[int, list[str]] = {}
    for column in columns:
        relation_id = column.relation_id
        columns_by_relation.setdefault(relation_id, []).append(column.column_name)

    freshness = "fresh" if connector.last_sync_at else "stale"
    health = "healthy" if connector.status == "ready" else "warning"
    return [
        {
            "id": relation.id,
            "connector_id": connector.id,
            "name": relation.relation_name,
            "schema": relation.schema_name,
            "qualified_name": relation.qualified_name,
            "source_type": relation.relation_type,
            "status": connector.status,
            "freshness_status": freshness,
            "last_synced_at": connector.last_sync_at or relation.updated_at,
            "record_count": relation.row_estimate,
            "schema_preview": columns_by_relation.get(relation.id, []),
            "health": health,
            "upload_history": [],
            "size_bytes": relation.size_bytes,
            "preview_row_count": caches.get(relation.id).preview_row_count if relation.id in caches else 0,
        }
        for relation in relations
    ]


def get_relation_preview(db: Session, relation_id: int) -> dict[str, Any]:
    relation = db.get(ConnectorRelation, relation_id)
    if relation is None:
        raise ValueError("Relation not found")
    cache = db.scalar(select(ConnectorRelationCache).where(ConnectorRelationCache.relation_id == relation_id))
    columns = db.scalars(
        select(ConnectorColumn)
        .where(ConnectorColumn.relation_id == relation_id)
        .order_by(ConnectorColumn.ordinal_position.asc())
    ).all()
    column_names = [item.column_name for item in columns]
    sample_rows = cache.sample_rows if cache else []
    return {
        "id": relation.id,
        "name": relation.relation_name,
        "schema": relation.schema_name,
        "source_uri": relation.qualified_name,
        "row_count": relation.row_estimate,
        "columns": column_names,
        "rows": sample_rows,
        "column_stats": cache.column_stats if cache else {},
        "relation_type": relation.relation_type,
    }


def get_connector_context(db: Session, connector_id: int) -> dict[str, Any]:
    connector = db.get(DataConnector, connector_id)
    if connector is None:
        raise ValueError("Connector not found")
    relation_summaries = list_relation_summaries(db, connector.organization_id)
    memory = db.scalar(
        select(SourceAgentMemory).where(
            SourceAgentMemory.organization_id == connector.organization_id,
            SourceAgentMemory.connector_id == connector.id,
        )
    )
    return {
        "connector": {
            "id": connector.id,
            "organization_id": connector.organization_id,
            "name": connector.name,
            "dialect": connector.dialect,
            "status": connector.status,
            "schemas": connector.included_schemas or ["public"],
            "uri": decrypt_connector_uri(connector.encrypted_uri),
        },
        "relations": relation_summaries,
        "memory": None
        if memory is None
        else {
            "status": memory.status,
            "summary_text": memory.summary_text,
            "dashboard_brief": memory.dashboard_brief,
            "schema_notes": memory.schema_notes,
        },
    }


def get_source_memory(db: Session, organization_id: int) -> dict[str, Any] | None:
    connector = get_primary_connector(db, organization_id)
    if connector is None:
        return None
    memory = db.scalar(
        select(SourceAgentMemory).where(
            SourceAgentMemory.organization_id == organization_id,
            SourceAgentMemory.connector_id == connector.id,
        )
    )
    if memory is None:
        return None
    return {
        "id": memory.id,
        "organization_id": memory.organization_id,
        "connector_id": memory.connector_id,
        "status": memory.status,
        "engine_name": memory.engine_name,
        "summary_text": memory.summary_text,
        "dashboard_brief": memory.dashboard_brief,
        "schema_notes": memory.schema_notes,
        "raw_payload": memory.raw_payload,
        "created_at": memory.created_at,
        "updated_at": memory.updated_at,
    }
