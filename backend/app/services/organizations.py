from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.domain import Organization


def create_organization(
    db: Session,
    *,
    name: str,
    industry: str,
    geography: str,
) -> Organization:
    normalized_name = name.strip()
    normalized_industry = industry.strip()
    normalized_geography = geography.strip()

    if not normalized_name or not normalized_industry or not normalized_geography:
        raise ValueError("Name, industry, and geography are required")

    existing = db.scalar(
        select(Organization).where(func.lower(Organization.name) == normalized_name.lower())
    )
    if existing is not None:
        raise ValueError("Organization name already exists")

    organization = Organization(
        name=normalized_name,
        industry=normalized_industry,
        geography=normalized_geography,
    )
    db.add(organization)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("Organization name already exists") from exc

    db.refresh(organization)
    return organization
