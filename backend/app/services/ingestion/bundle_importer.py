from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.ingestion.quick_commerce_bundle import import_quick_commerce_bundle


SUPPORTED_BUNDLES = {
    "quickbasket_india": import_quick_commerce_bundle,
    "quick_commerce_v1": import_quick_commerce_bundle,
}


def resolve_bundle_dir(*, bundle_name: str | None, bundle_path: str | None) -> Path:
    if bundle_path:
        return Path(bundle_path).expanduser().resolve()
    name = bundle_name or "quickbasket_india"
    return (settings.synthetic_data_dir / name).resolve()


def import_synthetic_bundle(
    db: Session,
    *,
    bundle_name: str | None = None,
    bundle_path: str | None = None,
    reset: bool = True,
) -> dict:
    resolved_bundle_name = bundle_name or "quickbasket_india"
    loader = SUPPORTED_BUNDLES.get(resolved_bundle_name, import_quick_commerce_bundle)
    bundle_dir = resolve_bundle_dir(bundle_name=resolved_bundle_name, bundle_path=bundle_path)
    return loader(db, bundle_dir=bundle_dir, reset=reset)
