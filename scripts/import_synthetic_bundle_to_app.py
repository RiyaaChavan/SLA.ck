#!/usr/bin/env python3

from __future__ import annotations

import argparse

from app.db.session import SessionLocal
from app.services.ingestion.bundle_importer import import_synthetic_bundle


def main() -> None:
    parser = argparse.ArgumentParser(description="Import a synthetic data bundle into the Business Sentry app database.")
    parser.add_argument("--bundle-name", default="quickbasket_india", help="Synthetic bundle name under data/synthetic.")
    parser.add_argument("--bundle-path", default=None, help="Override bundle path.")
    parser.add_argument("--no-reset", action="store_true", help="Do not reset existing database contents before import.")
    args = parser.parse_args()

    with SessionLocal() as db:
        result = import_synthetic_bundle(
            db,
            bundle_name=args.bundle_name,
            bundle_path=args.bundle_path,
            reset=not args.no_reset,
        )

    print("Imported synthetic bundle:")
    for key, value in result.items():
        print(f"- {key}: {value}")


if __name__ == "__main__":
    main()
