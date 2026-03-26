from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import ApprovalPolicy
from app.utils.audit import log_event


def _policy_out(policy: ApprovalPolicy) -> dict:
    return {
        "id": policy.id,
        "name": policy.name,
        "module": policy.module,
        "scope": policy.scope,
        "risk_level": policy.risk_level,
        "enabled": policy.enabled,
        "approver_name": policy.approver_name,
        "allowed_actions": policy.allowed_actions,
        "condition_summary": policy.condition_summary,
        "expires_at": policy.expires_at,
    }


def get_auto_mode_settings(db: Session, organization_id: int) -> dict:
    policies = db.scalars(
        select(ApprovalPolicy)
        .where(ApprovalPolicy.organization_id == organization_id)
        .order_by(ApprovalPolicy.created_at.asc())
    ).all()
    return {"organization_id": organization_id, "policies": [_policy_out(policy) for policy in policies]}


def update_auto_mode_settings(db: Session, organization_id: int, updates: list[dict]) -> dict:
    policies = {
        policy.id: policy
        for policy in db.scalars(
            select(ApprovalPolicy).where(ApprovalPolicy.organization_id == organization_id)
        ).all()
    }
    for payload in updates:
        policy = policies.get(payload["id"])
        if policy is None:
            continue
        if "enabled" in payload and payload["enabled"] is not None:
            policy.enabled = payload["enabled"]
        if payload.get("approver_name") is not None:
            policy.approver_name = payload["approver_name"]
        if payload.get("condition_summary") is not None:
            policy.condition_summary = payload["condition_summary"]
        if "expires_at" in payload:
            policy.expires_at = payload["expires_at"]
    log_event(
        db,
        organization_id=organization_id,
        entity_type="approval_policy",
        entity_id=organization_id,
        event_type="updated",
        payload={"updated_policy_ids": [item["id"] for item in updates]},
    )
    db.commit()
    return get_auto_mode_settings(db, organization_id)
