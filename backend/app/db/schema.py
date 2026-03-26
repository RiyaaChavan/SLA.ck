from sqlalchemy import text
from sqlalchemy.engine import Engine


SQLITE_COLUMN_PATCHES: dict[str, list[tuple[str, str]]] = {
    "workflows": [
        ("intake_metadata", "JSON DEFAULT '{}'"),
    ],
    "sla_extraction_batches": [
        ("document_type", "TEXT DEFAULT 'pdf'"),
        ("extraction_source", "TEXT DEFAULT 'text_parsed'"),
        ("run_metadata", "JSON DEFAULT '{}'"),
    ],
    "sla_extraction_candidates": [
        ("escalation_policy", "JSON DEFAULT '{}'"),
        ("business_hours_definition", "JSON DEFAULT '{}'"),
        ("auto_action_policy", "JSON DEFAULT '{}'"),
        ("confidence_score", "FLOAT DEFAULT 0"),
        ("parsing_notes", "JSON DEFAULT '[]'"),
        ("extraction_source", "TEXT DEFAULT 'text_parsed'"),
        ("candidate_metadata", "JSON DEFAULT '{}'"),
    ],
    "sla_rulebook_entries": [
        ("escalation_policy", "JSON DEFAULT '{}'"),
        ("business_hours_definition", "JSON DEFAULT '{}'"),
        ("auto_action_policy", "JSON DEFAULT '{}'"),
        ("source_batch_id", "INTEGER"),
        ("rule_version", "INTEGER DEFAULT 1"),
        ("reviewed_by", "TEXT"),
        ("review_notes", "TEXT"),
        ("supersedes_rule_id", "INTEGER"),
    ],
}


def reconcile_sqlite_schema(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as connection:
        for table_name, columns in SQLITE_COLUMN_PATCHES.items():
            existing = {
                row[1]
                for row in connection.exec_driver_sql(f"PRAGMA table_info('{table_name}')").fetchall()
            }
            if not existing:
                continue
            for column_name, sql_type in columns:
                if column_name in existing:
                    continue
                connection.execute(
                    text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {sql_type}")
                )
