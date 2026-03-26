from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import SchemaMapping, SourceUpload
from app.services.etl.normalizer import suggest_mappings
from app.utils.audit import log_event


def _freshness_status(timestamp: datetime) -> str:
    current = datetime.now(UTC) if timestamp.tzinfo else datetime.now(UTC).replace(tzinfo=None)
    delta_hours = (current - timestamp).total_seconds() / 3600
    if delta_hours <= 6:
        return "fresh"
    if delta_hours <= 24:
        return "monitor"
    return "stale"


def _health_from_freshness(status: str) -> str:
    return {"fresh": "healthy", "monitor": "warning", "stale": "stale"}[status]


def list_data_sources(db: Session, organization_id: int) -> list[dict]:
    uploads = db.scalars(
        select(SourceUpload)
        .where(SourceUpload.organization_id == organization_id)
        .order_by(SourceUpload.created_at.desc())
    ).all()
    mappings = db.scalars(
        select(SchemaMapping)
        .where(SchemaMapping.organization_id == organization_id)
        .order_by(SchemaMapping.created_at.desc())
    ).all()
    mapping_by_source = {item.source_name: item for item in mappings}

    results: list[dict] = []
    for upload in uploads:
        mapping = mapping_by_source.get(upload.name)
        freshness = _freshness_status(upload.created_at)
        history = [
            {
                "uploaded_at": item.created_at,
                "record_count": item.record_count,
                "file_path": item.file_path,
            }
            for item in uploads
            if item.name == upload.name and item.source_kind == upload.source_kind
        ][:3]
        results.append(
            {
                "id": upload.id,
                "name": upload.name,
                "source_type": upload.source_kind,
                "status": mapping.status if mapping else "connected",
                "freshness_status": freshness,
                "last_synced_at": upload.created_at,
                "record_count": upload.record_count,
                "schema_preview": (mapping.raw_schema or {}).get("columns", []) if mapping else [],
                "health": _health_from_freshness(freshness),
                "upload_history": history,
            }
        )
    return results


def create_data_source(
    db: Session,
    *,
    organization_id: int,
    name: str,
    source_type: str,
    record_count: int,
    file_name: str | None,
    sample_columns: list[str],
) -> dict:
    upload = SourceUpload(
        organization_id=organization_id,
        name=name,
        source_kind=source_type,
        record_count=record_count,
        file_path=f"/uploads/{file_name or name.lower().replace(' ', '-')}.json",
    )
    db.add(upload)
    db.flush()

    mapping = SchemaMapping(
        organization_id=organization_id,
        source_name=name,
        source_type=source_type,
        raw_schema={"columns": sample_columns},
        mapped_schema=suggest_mappings(sample_columns),
        confidence_score=0.84 if sample_columns else 0.5,
        status="preview_ready",
    )
    db.add(mapping)
    log_event(
        db,
        organization_id=organization_id,
        entity_type="data_source",
        entity_id=upload.id,
        event_type="uploaded",
        payload={"name": name, "source_type": source_type, "record_count": record_count},
    )
    db.commit()
    return next(item for item in list_data_sources(db, organization_id) if item["id"] == upload.id)
