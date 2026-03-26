import time
from abc import ABC, abstractmethod
from typing import Any

from app.core.config import settings
from app.services.sla.contracts import (
    AgentRunMetadata,
    BusinessContractDocument,
    DocumentIntake,
    ExtractionOutput,
    SlaCandidateContract,
)
from app.utils.logging import get_logger


logger = get_logger("app.sla.providers")


class SlaExtractionProvider(ABC):
    @abstractmethod
    def extract(self, intake: DocumentIntake) -> ExtractionOutput:
        raise NotImplementedError


class HeuristicSlaExtractionProvider(SlaExtractionProvider):
    provider_name = "cerebras-compatible-fallback"
    model_name = "heuristic-sla-parser-v2"

    def extract(self, intake: DocumentIntake) -> ExtractionOutput:
        logger.info(
            "sla_extraction_provider_start provider=%s model=%s source=%s doc_type=%s mode=fallback",
            self.provider_name,
            self.model_name,
            intake.source_document_name,
            intake.document_type,
        )
        started = time.perf_counter()
        combined = f"{intake.source_document_name.lower()}\n{(intake.raw_text or '').lower()}"
        candidates: list[SlaCandidateContract] = []

        if any(token in combined for token in ("premium", "p1", "critical support", "vip")):
            candidates.append(
                SlaCandidateContract(
                    name="Premium P1 Response SLA",
                    applies_to={
                        "priority": "P1",
                        "customer_tier": "premium",
                        "issue_type": "support_ticket",
                        "workflow_category": "support",
                    },
                    conditions="Apply when premium incidents are opened in the support or ops queue.",
                    response_deadline_hours=1,
                    resolution_deadline_hours=4,
                    penalty_amount=90000.0,
                    escalation_owner="Support Director",
                    escalation_policy={"levels": ["queue_lead", "support_director"]},
                    business_hours_logic="24x7",
                    business_hours_definition={"schedule": "24x7"},
                    auto_action_allowed=True,
                    auto_action_policy={"allowed_actions": ["notify_owner", "reroute_queue"]},
                    confidence_score=0.91,
                    parsing_notes=["Matched premium support language from document signals."],
                    extraction_source=intake.extraction_source,
                    business_document=BusinessContractDocument(
                        executive_summary=(
                            "Premium support contract with tight response and restoration commitments "
                            "for business-critical incidents."
                        ),
                        service_scope=[
                            "Premium and enterprise customer incidents",
                            "Critical support queues requiring 24x7 operations coverage",
                        ],
                        service_level_commitments=[
                            "Acknowledge P1 incidents within 1 hour.",
                            "Resolve or restore service within 4 hours.",
                        ],
                        operational_obligations=[
                            "Support Director owns breach prevention.",
                            "Queue lead must rebalance or reroute when risk rises.",
                        ],
                        exclusions_and_assumptions=[
                            "Assumes the incident is correctly tagged as premium/P1.",
                        ],
                        commercial_terms=["Penalty exposure of INR 90,000 per breach."],
                        escalation_path=["Queue lead", "Support Director"],
                        approval_and_governance=[
                            "Any automated reroute must remain reviewable in the business rulebook.",
                        ],
                        risk_watchouts=[
                            "Queue backlog can convert this clause into an immediate SLA-risk alert.",
                        ],
                    ),
                    candidate_metadata={"provider_mode": "heuristic", "signal_terms": ["premium", "p1"]},
                )
            )

        if any(token in combined for token in ("vendor", "dispute", "procurement", "finance discrepancy")):
            candidates.append(
                SlaCandidateContract(
                    name="Vendor Dispute SLA",
                    applies_to={
                        "workflow": "vendor_dispute",
                        "workflow_category": "finance",
                        "business_unit": "procurement",
                        "issue_type": "discrepancy_case",
                    },
                    conditions="Apply when finance or procurement raises a vendor discrepancy case.",
                    response_deadline_hours=8,
                    resolution_deadline_hours=24,
                    penalty_amount=30000.0,
                    escalation_owner="Procurement Head",
                    escalation_policy={"levels": ["finance_manager", "procurement_head"]},
                    business_hours_logic="business_hours",
                    business_hours_definition={"schedule": "mon-fri-09:00-18:00"},
                    auto_action_allowed=False,
                    auto_action_policy={"allowed_actions": []},
                    confidence_score=0.82,
                    parsing_notes=["Detected vendor dispute / procurement discrepancy language."],
                    extraction_source=intake.extraction_source,
                    business_document=BusinessContractDocument(
                        executive_summary=(
                            "Commercial dispute clause for vendor-facing finance and procurement issues."
                        ),
                        service_scope=[
                            "Vendor disputes and invoice discrepancy cases",
                            "Procurement escalations requiring finance validation",
                        ],
                        service_level_commitments=[
                            "Business response within 8 hours.",
                            "Resolution within 24 hours.",
                        ],
                        operational_obligations=[
                            "Procurement Head owns closure of disputed commercial items.",
                            "Finance manager validates evidence before closure.",
                        ],
                        exclusions_and_assumptions=[
                            "Clock runs on defined business hours for standard disputes.",
                        ],
                        commercial_terms=["Penalty exposure of INR 30,000 per breach."],
                        escalation_path=["Finance manager", "Procurement Head"],
                        approval_and_governance=[
                            "Commercial exceptions should be routed through approval before settlement.",
                        ],
                        risk_watchouts=[
                            "Unresolved disputes may increase both penalty risk and working-capital exposure.",
                        ],
                    ),
                    candidate_metadata={"provider_mode": "heuristic", "signal_terms": ["vendor", "dispute"]},
                )
            )

        if not candidates:
            candidates.append(
                SlaCandidateContract(
                    name="Operations Standard SLA",
                    applies_to={
                        "workflow_category": "operations",
                        "priority": "standard",
                        "issue_type": "ops_task",
                    },
                    conditions="Apply to standard operational work items and warehouse requests.",
                    response_deadline_hours=4,
                    resolution_deadline_hours=12,
                    penalty_amount=45000.0,
                    escalation_owner="Operations Director",
                    escalation_policy={"levels": ["queue_owner", "operations_director"]},
                    business_hours_logic="business_hours",
                    business_hours_definition={"schedule": "mon-sat-09:00-20:00"},
                    auto_action_allowed=False,
                    auto_action_policy={"allowed_actions": ["notify_owner"]},
                    confidence_score=0.76,
                    parsing_notes=["Used default operational fallback because no narrower policy phrase was detected."],
                    extraction_source=intake.extraction_source,
                    business_document=BusinessContractDocument(
                        executive_summary=(
                            "Default operational policy for standard shared-services work where no narrower clause is present."
                        ),
                        service_scope=[
                            "Standard operations tasks",
                            "Warehouse and shared services requests without bespoke contract language",
                        ],
                        service_level_commitments=[
                            "Respond within 4 hours.",
                            "Resolve within 12 hours.",
                        ],
                        operational_obligations=[
                            "Operations Director owns breach escalation and queue health review.",
                        ],
                        exclusions_and_assumptions=[
                            "Fallback clause to be replaced when more specific contract language is found.",
                        ],
                        commercial_terms=["Penalty exposure of INR 45,000 per breach."],
                        escalation_path=["Queue owner", "Operations Director"],
                        approval_and_governance=[
                            "Owner notification is allowed; deeper automation stays review-gated.",
                        ],
                        risk_watchouts=[
                            "Broad fallback clauses should be reviewed before production activation.",
                        ],
                    ),
                    candidate_metadata={"provider_mode": "heuristic", "signal_terms": ["fallback"]},
                )
            )

        latency_ms = int((time.perf_counter() - started) * 1000)
        avg_confidence = round(
            sum(candidate.confidence_score for candidate in candidates) / max(len(candidates), 1),
            3,
        )
        logger.info(
            "sla_extraction_provider_done provider=%s model=%s source=%s candidates=%s latency_ms=%s confidence=%s",
            self.provider_name,
            self.model_name,
            intake.source_document_name,
            len(candidates),
            latency_ms,
            avg_confidence,
        )
        return ExtractionOutput(
            intake=intake,
            candidates=candidates,
            run_metadata=AgentRunMetadata(
                provider=self.provider_name,
                model=self.model_name,
                confidence=avg_confidence,
                latency_ms=latency_ms,
                notes=[
                    "Provider seam is Cerebras-compatible; network-backed provider can replace this adapter later.",
                    "Extraction remains review-first and deterministic for local/test environments.",
                ],
            ),
        )


def get_extraction_provider() -> SlaExtractionProvider:
    if settings.gemini_api_key:
        logger.info("sla_extraction_provider_selected provider=google-gemini model=%s", settings.gemini_model)
        return GeminiSlaExtractionProvider()
    logger.warning("sla_extraction_provider_selected provider=fallback reason=missing_gemini_api_key")
    return HeuristicSlaExtractionProvider()


class GeminiSlaExtractionProvider(SlaExtractionProvider):
    provider_name = "google-gemini"

    def __init__(self) -> None:
        self.model_name = settings.gemini_model

    def _schema(self) -> dict[str, Any]:
        return {
            "type": "OBJECT",
            "properties": {
                "candidates": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "properties": {
                            "name": {"type": "STRING"},
                            "applies_to": {"type": "OBJECT"},
                            "conditions": {"type": "STRING"},
                            "response_deadline_hours": {"type": "NUMBER"},
                            "resolution_deadline_hours": {"type": "NUMBER"},
                            "penalty_amount": {"type": "NUMBER"},
                            "escalation_owner": {"type": "STRING"},
                            "escalation_policy": {"type": "OBJECT"},
                            "business_hours_logic": {"type": "STRING"},
                            "business_hours_definition": {"type": "OBJECT"},
                            "auto_action_allowed": {"type": "BOOLEAN"},
                            "auto_action_policy": {"type": "OBJECT"},
                            "confidence_score": {"type": "NUMBER"},
                            "parsing_notes": {"type": "ARRAY", "items": {"type": "STRING"}},
                            "business_document": {
                                "type": "OBJECT",
                                "properties": {
                                    "executive_summary": {"type": "STRING"},
                                    "service_scope": {"type": "ARRAY", "items": {"type": "STRING"}},
                                    "service_level_commitments": {"type": "ARRAY", "items": {"type": "STRING"}},
                                    "operational_obligations": {"type": "ARRAY", "items": {"type": "STRING"}},
                                    "exclusions_and_assumptions": {"type": "ARRAY", "items": {"type": "STRING"}},
                                    "commercial_terms": {"type": "ARRAY", "items": {"type": "STRING"}},
                                    "escalation_path": {"type": "ARRAY", "items": {"type": "STRING"}},
                                    "approval_and_governance": {"type": "ARRAY", "items": {"type": "STRING"}},
                                    "risk_watchouts": {"type": "ARRAY", "items": {"type": "STRING"}},
                                },
                            },
                            "candidate_metadata": {"type": "OBJECT"},
                        },
                        "required": [
                            "name",
                            "applies_to",
                            "conditions",
                            "response_deadline_hours",
                            "resolution_deadline_hours",
                            "penalty_amount",
                            "escalation_owner",
                            "business_hours_logic",
                            "auto_action_allowed",
                            "confidence_score",
                            "business_document",
                        ],
                    },
                },
            },
            "required": ["candidates"],
        }

    def extract(self, intake: DocumentIntake) -> ExtractionOutput:
        started = time.perf_counter()
        logger.info(
            "sla_extraction_provider_start provider=%s model=%s source=%s doc_type=%s mode=structured_generation",
            self.provider_name,
            self.model_name,
            intake.source_document_name,
            intake.document_type,
        )
        try:
            from google import genai
            from google.genai import types
        except ImportError as exc:
            raise RuntimeError("google-genai is required for Gemini extraction") from exc

        client = genai.Client(api_key=settings.gemini_api_key)
        prompt = (
            "You extract SLA policy candidates from business documents.\n"
            "Return only structured JSON matching the schema.\n"
            "For each candidate, create business-grade contract notes that procurement, legal, operations, and executives can review directly.\n"
            "Normalize deadlines to integer hours.\n"
            "Use applies_to dimensions only from these keys when relevant: "
            "issue_type, priority, customer_tier, region, workflow_category, business_unit, workflow, department, team.\n"
            "Preserve review-first semantics; do not invent active rules.\n\n"
            f"Document name: {intake.source_document_name}\n"
            f"Document type: {intake.document_type}\n"
            f"Extraction source: {intake.extraction_source}\n\n"
            f"Document text:\n{intake.raw_text or ''}"
        )
        try:
            response = client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=self._schema(),
                    temperature=0.1,
                ),
            )
        except Exception:
            logger.exception(
                "sla_extraction_provider_error provider=%s model=%s source=%s",
                self.provider_name,
                self.model_name,
                intake.source_document_name,
            )
            raise
        payload = getattr(response, "parsed", None)
        if payload is None:
            import json

            payload = json.loads(response.text)
        candidates = [
            SlaCandidateContract(
                **candidate,
                extraction_source=intake.extraction_source,
            )
            for candidate in payload.get("candidates", [])
        ]
        latency_ms = int((time.perf_counter() - started) * 1000)
        avg_confidence = round(
            sum(candidate.confidence_score for candidate in candidates) / max(len(candidates), 1),
            3,
        )
        logger.info(
            "sla_extraction_provider_done provider=%s model=%s source=%s candidates=%s latency_ms=%s confidence=%s names=%s",
            self.provider_name,
            self.model_name,
            intake.source_document_name,
            len(candidates),
            latency_ms,
            avg_confidence,
            [candidate.name for candidate in candidates],
        )
        return ExtractionOutput(
            intake=intake,
            candidates=candidates,
            run_metadata=AgentRunMetadata(
                provider=self.provider_name,
                model=self.model_name,
                mode="structured_generation",
                confidence=avg_confidence,
                latency_ms=latency_ms,
                notes=["Extracted through Gemini structured response schema."],
            ),
        )
