import json
from typing import Any

from pydantic import BaseModel, Field

from app.core.config import settings
from app.utils.logging import get_logger


logger = get_logger("app.agents")


class ActionRecommendationPayload(BaseModel):
    title: str
    rationale: str
    action_type: str
    playbook_steps: list[str] = Field(default_factory=list)
    expected_savings_ratio: float = 0.63
    confidence: float = 0.7
    metadata: dict[str, Any] = Field(default_factory=dict)


class ApprovalSuggestionPayload(BaseModel):
    should_auto_approve: bool = False
    recommended_approver: str
    reasoning: str
    confidence: float = 0.7
    metadata: dict[str, Any] = Field(default_factory=dict)


class CerebrasLangChainAgent:
    def __init__(self) -> None:
        self.model_name = settings.cerebras_model

    def _build_chat_model(self):
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=self.model_name,
            api_key=settings.cerebras_api_key,
            base_url=settings.cerebras_base_url,
            temperature=0.1,
        )

    def recommend_action(self, alert_context: dict[str, Any]) -> ActionRecommendationPayload:
        if not settings.cerebras_api_key:
            logger.warning(
                "agent_recommendation_fallback reason=missing_cerebras_api_key alert_id=%s type=%s",
                alert_context.get("alert_id"),
                alert_context.get("type"),
            )
            return self._fallback_recommendation(alert_context)
        logger.info(
            "agent_recommendation_start provider=cerebras model=%s alert_id=%s type=%s severity=%s",
            self.model_name,
            alert_context.get("alert_id"),
            alert_context.get("type"),
            alert_context.get("severity"),
        )
        model = self._build_chat_model().with_structured_output(ActionRecommendationPayload)
        prompt = (
            "You are an operations action-planning agent.\n"
            "Return one actionable recommendation for the alert context.\n"
            "Keep action_type short snake_case.\n"
            "Prefer deterministic business actions.\n\n"
            f"Alert context:\n{json.dumps(alert_context, default=str)}"
        )
        try:
            payload = model.invoke(prompt)
        except Exception:
            logger.exception(
                "agent_recommendation_error provider=cerebras model=%s alert_id=%s",
                self.model_name,
                alert_context.get("alert_id"),
            )
            raise
        if isinstance(payload, ActionRecommendationPayload):
            logger.info(
                "agent_recommendation_done provider=cerebras model=%s alert_id=%s action_type=%s confidence=%s",
                self.model_name,
                alert_context.get("alert_id"),
                payload.action_type,
                payload.confidence,
            )
            return payload
        result = ActionRecommendationPayload.model_validate(payload)
        logger.info(
            "agent_recommendation_done provider=cerebras model=%s alert_id=%s action_type=%s confidence=%s",
            self.model_name,
            alert_context.get("alert_id"),
            result.action_type,
            result.confidence,
        )
        return result

    def suggest_approval(self, approval_context: dict[str, Any]) -> ApprovalSuggestionPayload:
        if not settings.cerebras_api_key:
            logger.warning(
                "agent_approval_fallback reason=missing_cerebras_api_key action_type=%s risk_level=%s",
                approval_context.get("action_type"),
                approval_context.get("risk_level"),
            )
            return self._fallback_approval(approval_context)
        logger.info(
            "agent_approval_start provider=cerebras model=%s action_type=%s risk_level=%s",
            self.model_name,
            approval_context.get("action_type"),
            approval_context.get("risk_level"),
        )
        model = self._build_chat_model().with_structured_output(ApprovalSuggestionPayload)
        prompt = (
            "You evaluate whether a workflow action should be auto-approved under existing guardrails.\n"
            "Recommend the approver and explain the reasoning.\n\n"
            f"Approval context:\n{json.dumps(approval_context, default=str)}"
        )
        try:
            payload = model.invoke(prompt)
        except Exception:
            logger.exception(
                "agent_approval_error provider=cerebras model=%s action_type=%s",
                self.model_name,
                approval_context.get("action_type"),
            )
            raise
        if isinstance(payload, ApprovalSuggestionPayload):
            logger.info(
                "agent_approval_done provider=cerebras model=%s action_type=%s should_auto_approve=%s approver=%s confidence=%s",
                self.model_name,
                approval_context.get("action_type"),
                payload.should_auto_approve,
                payload.recommended_approver,
                payload.confidence,
            )
            return payload
        result = ApprovalSuggestionPayload.model_validate(payload)
        logger.info(
            "agent_approval_done provider=cerebras model=%s action_type=%s should_auto_approve=%s approver=%s confidence=%s",
            self.model_name,
            approval_context.get("action_type"),
            result.should_auto_approve,
            result.recommended_approver,
            result.confidence,
        )
        return result

    def _fallback_recommendation(self, alert_context: dict[str, Any]) -> ActionRecommendationPayload:
        risk = str(alert_context.get("severity", "medium"))
        atype = str(alert_context.get("type", "alert")).replace("_", " ").strip() or "alert"
        raw_title = str(alert_context.get("title") or "Operational alert").strip()
        payload = alert_context.get("payload") if isinstance(alert_context.get("payload"), dict) else {}
        refs = payload.get("invoice_refs") if isinstance(payload.get("invoice_refs"), list) else []
        if refs and str(alert_context.get("type")) == "duplicate_spend":
            ref_line = ", ".join(str(r) for r in refs[:5])
            if len(refs) > 5:
                ref_line = f"{ref_line} (+{len(refs) - 5} more)"
            raw_title = f"{raw_title} — {ref_line}"
        title = f"{atype.title()}: {raw_title}"[:250]
        desc = str(alert_context.get("description") or "").strip()
        rationale = "Fallback recommendation generated because Cerebras agent is not configured."
        if desc:
            snippet = desc if len(desc) <= 220 else f"{desc[:220]}…"
            rationale = f"{rationale} {snippet}"
        action_type = "open_review_task"
        steps = ["Review evidence", "Notify owner", "Track outcome"]
        if "sla" in str(alert_context.get("type", "")).lower():
            action_type = "reroute_queue"
            steps = ["Escalate queue owner", "Reassign backlog", "Monitor SLA countdown"]
        return ActionRecommendationPayload(
            title=title,
            rationale=rationale,
            action_type=action_type,
            playbook_steps=steps,
            confidence=0.55 if risk == "medium" else 0.62,
            metadata={"provider": "fallback", "model": "deterministic"},
        )

    def _fallback_approval(self, approval_context: dict[str, Any]) -> ApprovalSuggestionPayload:
        risk_level = str(approval_context.get("risk_level", "medium")).lower()
        allowed = approval_context.get("allowed_actions", [])
        action_type = approval_context.get("action_type")
        should_auto_approve = risk_level in {"low", "medium"} and action_type in allowed
        return ApprovalSuggestionPayload(
            should_auto_approve=should_auto_approve,
            recommended_approver=str(approval_context.get("default_approver", "Operations Director")),
            reasoning="Fallback approval suggestion generated because Cerebras agent is not configured.",
            confidence=0.58,
            metadata={"provider": "fallback", "model": "deterministic"},
        )


def get_agent() -> CerebrasLangChainAgent:
    return CerebrasLangChainAgent()
