#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
from pathlib import Path

from sqlalchemy import create_engine

SOURCE_FILES = [
    "organizations.csv",
    "cities.csv",
    "dark_stores.csv",
    "teams.csv",
    "employees.csv",
    "drivers.csv",
    "vendors.csv",
    "contracts.csv",
    "orders.csv",
    "order_items.csv",
    "delivery_events.csv",
    "inventory_snapshots.csv",
    "work_items.csv",
    "invoices.csv",
    "ground_truth_anomalies.csv",
    "approval_playbooks.csv",
]


def _table_name(file_name: str) -> str:
    return file_name.removesuffix(".csv")


def _quoted_columns(columns: list[str]) -> str:
    return ", ".join(f'"{column}" TEXT' for column in columns)


def _copy_csv_into_table(database_url: str, schema: str, csv_path: Path, reset: bool) -> int:
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        columns = next(reader)

    engine = create_engine(database_url)
    raw_connection = engine.raw_connection()
    table_name = _table_name(csv_path.name)
    qualified_table = f'"{schema}"."{table_name}"'
    try:
        with raw_connection.cursor() as cursor:
            cursor.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
            if reset:
                cursor.execute(f"DROP TABLE IF EXISTS {qualified_table}")
            cursor.execute(f"CREATE TABLE IF NOT EXISTS {qualified_table} ({_quoted_columns(columns)})")
            cursor.execute(f"TRUNCATE TABLE {qualified_table}")
            with csv_path.open("r", encoding="utf-8") as handle:
                with cursor.copy(
                    f"COPY {qualified_table} ({', '.join(f'\"{column}\"' for column in columns)}) "
                    "FROM STDIN WITH CSV HEADER"
                ) as copy:
                    while chunk := handle.read(1024 * 1024):
                        copy.write(chunk)
        raw_connection.commit()
    finally:
        raw_connection.close()
        engine.dispose()

    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        return max(sum(1 for _ in handle) - 1, 0)


def main() -> None:
    parser = argparse.ArgumentParser(description="Load a synthetic CSV bundle into a Postgres source database.")
    parser.add_argument(
        "--database-url",
        default="postgresql+psycopg://source_demo:source_demo@localhost:5433/source_demo",
        help="SQLAlchemy database URL for the source Postgres instance.",
    )
    parser.add_argument("--schema", default="synthetic_demo", help="Destination schema name.")
    parser.add_argument(
        "--bundle-dir",
        default=str(Path(__file__).resolve().parents[1] / "data" / "synthetic" / "delivra_india"),
        help="Directory containing the synthetic CSV bundle.",
    )
    parser.add_argument("--no-reset", action="store_true", help="Do not drop existing tables before load.")
    args = parser.parse_args()

    bundle_dir = Path(args.bundle_dir).resolve()
    if not bundle_dir.exists():
        raise SystemExit(f"Bundle directory not found: {bundle_dir}")

    print(f"Loading synthetic bundle from {bundle_dir}")
    print(f"Target database: {args.database_url}")
    print(f"Target schema: {args.schema}")
    for file_name in SOURCE_FILES:
        csv_path = bundle_dir / file_name
        if not csv_path.exists():
            print(f"- skipped {file_name}: missing")
            continue
        row_count = _copy_csv_into_table(args.database_url, args.schema, csv_path, reset=not args.no_reset)
        print(f"- loaded {file_name}: {row_count} rows")


if __name__ == "__main__":
    main()
