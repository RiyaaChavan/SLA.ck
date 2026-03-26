#!/usr/bin/env python3

from __future__ import annotations

import argparse

from app.db.session import SessionLocal
from app.services.ingestion.relational_source import import_quick_commerce_relational_source


def main() -> None:
    parser = argparse.ArgumentParser(description="Import a relational source database into the Business Sentry app.")
    parser.add_argument(
        "--database-url",
        default="postgresql+psycopg://source_demo:source_demo@localhost:5433/source_demo",
        help="SQLAlchemy database URL for the source database.",
    )
    parser.add_argument("--schema", default="synthetic_demo", help="Source schema name.")
    parser.add_argument("--no-reset", action="store_true", help="Do not reset the app database before import.")
    args = parser.parse_args()

    with SessionLocal() as db:
        result = import_quick_commerce_relational_source(
            db,
            database_url=args.database_url,
            schema=args.schema,
            reset=not args.no_reset,
        )

    print("Imported relational source:")
    for key, value in result.items():
        print(f"- {key}: {value}")


if __name__ == "__main__":
    main()
