from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.domain import ConnectedSource
from app.services.ingestion.quick_commerce_bundle import SOURCE_FILES, import_quick_commerce_sources


def _source_table_name(file_name: str) -> str:
    return file_name.removesuffix(".csv")


def _stringify_row(row: dict) -> dict[str, str]:
    payload: dict[str, str] = {}
    for key, value in row.items():
        payload[str(key)] = "" if value is None else str(value)
    return payload


def normalize_database_url(database_url: str) -> str:
    """Persist absolute SQLite paths so preview/reconnect works regardless of API process cwd."""
    url = make_url(database_url)
    if not url.drivername.startswith("sqlite"):
        return database_url
    if url.database is None:
        return database_url
    if url.database in (":memory:",):
        return database_url
    p = Path(url.database)
    if not p.is_absolute():
        p = (Path.cwd() / p).resolve()
    else:
        p = p.resolve()
    if not p.parent.is_dir():
        raise ValueError(f"SQLite database directory does not exist: {p.parent}")
    return f"sqlite:///{p.as_posix()}"


def _masked_source_label(database_url: str, schema: str) -> str:
    url: URL = make_url(database_url)
    driver = url.get_backend_name()
    host = url.host or "localhost"
    port = f":{url.port}" if url.port else ""
    database = url.database or ""
    return f"{driver}://{host}{port}/{database}#{schema}"


def _read_table_rows(database_url: str, schema: str, table_name: str) -> list[dict[str, str]]:
    engine = create_engine(database_url)
    identifier = f'"{schema}"."{table_name}"'
    query = text(f"SELECT * FROM {identifier}")
    try:
        with engine.connect() as conn:
            rows = conn.execute(query).mappings().all()
    except SQLAlchemyError as exc:
        raise ValueError(f"Failed to read {schema}.{table_name}: {exc}") from exc
    finally:
        engine.dispose()
    return [_stringify_row(dict(row)) for row in rows]


def load_quick_commerce_sources_from_database(
    database_url: str,
    *,
    schema: str = "public",
    source_files: Iterable[str] = SOURCE_FILES,
) -> dict[str, list[dict[str, str]]]:
    sources: dict[str, list[dict[str, str]]] = {}
    for file_name in source_files:
        sources[file_name] = _read_table_rows(database_url, schema, _source_table_name(file_name))
    return sources


def import_quick_commerce_relational_source(
    db: Session,
    *,
    database_url: str,
    schema: str = "public",
    reset: bool = True,
) -> dict:
    database_url = normalize_database_url(database_url)
    masked_uri = _masked_source_label(database_url, schema)
    sources = load_quick_commerce_sources_from_database(database_url, schema=schema)
    result = import_quick_commerce_sources(
        db,
        sources=sources,
        source_label=masked_uri,
        source_kind="relational_table",
        reset=reset,
    )
    connected_source = ConnectedSource(
        organization_id=result["organization_id"],
        name=f"{result['organization_name']} relational source",
        source_kind="relational_table",
        database_url=database_url,
        schema_name=schema,
        masked_uri=masked_uri,
        active=True,
    )
    db.add(connected_source)
    db.commit()
    db.refresh(connected_source)
    result["connected_source_id"] = connected_source.id
    result["source_database"] = masked_uri
    result["schema"] = schema
    return result
