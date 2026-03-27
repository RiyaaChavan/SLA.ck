import json
import logging
import time
from typing import Any

from fastapi import FastAPI, HTTPException
from langchain_core.callbacks.base import BaseCallbackHandler
from pydantic import BaseModel, Field

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

from app.core.config import settings
from app.services.artifact_event_client import emit_remote_artifact_event
from app.utils.logging import get_logger

logger = get_logger("app.dashboard_agent")


class A2ARequest(BaseModel):
    jsonrpc: str = "2.0"
    id: str
    method: str
    params: dict


app = FastAPI(title="Business Sentry Dashboard Agent")


class AgentTraceCallbackHandler(BaseCallbackHandler):
    def __init__(self, connector_id: int, agent_name: str) -> None:
        self.connector_id = connector_id
        self.agent_name = agent_name

    def _emit(self, *, message: str, stage: str, detail: dict[str, Any] | None = None) -> None:
        emit_remote_artifact_event(
            self.connector_id,
            kind="trace",
            stage=stage,
            agent=self.agent_name,
            status="running",
            message=message,
            detail=detail,
        )

    def on_llm_start(self, serialized: dict[str, Any], prompts: list[str], **kwargs: Any) -> Any:
        self._emit(
            stage="llm_start",
            message="Preparing structured dashboard output.",
            detail={"prompt_preview": prompts[0][:240] if prompts else ""},
        )

    def on_llm_end(self, response, **kwargs: Any) -> Any:
        self._emit(stage="llm_end", message="Structured dashboard output returned.")


class DashboardMetric(BaseModel):
    kind: str
    title: str
    binding: str


class DashboardWidget(BaseModel):
    kind: str
    title: str
    binding: str
    empty_copy: str | None = None


class DashboardSpecResponse(BaseModel):
    title: str
    subtitle: str
    metrics: list[DashboardMetric] = Field(default_factory=list)
    widgets: list[DashboardWidget] = Field(default_factory=list)
    version: int = 1
    preset_count: int = 0


def _build_llm():
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=settings.cerebras_model,
        api_key=settings.cerebras_api_key,
        base_url=settings.cerebras_base_url,
        temperature=0.1,
    )


def _build_gemini_llm():
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
        temperature=0.1,
    )


def _generate_dashboard_with_langchain(context: dict[str, Any]) -> dict[str, Any]:
    presets = context.get("presets", [])
    summary_text = context.get("summary_text", "")
    dashboard_brief = context.get("dashboard_brief", "")
    connector = context.get("connector", {})
    connector_id = int(connector.get("id") or 0)

    if not settings.gemini_api_key and not settings.cerebras_api_key:
        raise ValueError("GEMINI_API_KEY or CEREBRAS_API_KEY required")

    # Use Gemini if available, else Cerebras
    if settings.gemini_api_key:
        llm = _build_gemini_llm()
        logger.info("dashboard_agent_using_llm model=gemini")
    else:
        llm = _build_llm()
        logger.info("dashboard_agent_using_llm model=cerebras")

    structured_llm = llm.with_structured_output(DashboardSpecResponse)
    trace_handler = AgentTraceCallbackHandler(connector_id, "dashboard_agent")

    try:
        logger.info("dashboard_agent_generating_spec")
        emit_remote_artifact_event(
            connector_id,
            kind="trace",
            stage="spec_generation",
            agent="dashboard_agent",
            status="running",
            message="Generating dashboard metrics and widgets from validated presets.",
            detail={"preset_count": len(presets)},
        )
        spec_result = structured_llm.invoke(
            f"""Generate a complete operations dashboard specification for anomaly monitoring.

Context:
- Summary: {summary_text}
- Brief: {dashboard_brief}
- Presets: {len(presets)} anomaly queries
- Preset details:
{json.dumps(
    [
        {
            "name": p.get("name"),
            "description": p.get("description"),
            "category": p.get("category") or p.get("module"),
            "schedule_minutes": p.get("schedule_minutes"),
            "validation_status": p.get("validation_status"),
        }
        for p in presets[:8]
    ],
    indent=2,
)}

Requirements:
- Return 2-4 metrics and 2-4 widgets.
- Metrics kinds must be 'stat' or 'chart'.
- Widget kinds must be 'list', 'table', or 'chart'.
- Use concise titles and stable snake_case bindings.
- Subtitle should be short and business-facing.
- Set version to 1.
- Set preset_count to {len(presets)}.
""",
            config={"callbacks": [trace_handler]},
        )
        logger.info("dashboard_agent_spec_generated")
        return spec_result.model_dump()

    except Exception as exc:
        logger.exception("dashboard_agent_error error=%s", str(exc))
        logger.warning("dashboard_agent_spec_fallback")
        return {
            "title": "Operations Dashboard",
            "subtitle": dashboard_brief or "Generated dashboard",
            "metrics": [
                {"kind": "stat", "title": "Total Anomalies", "binding": "total_anomalies"},
                {"kind": "stat", "title": "Active Presets", "binding": "preset_count"},
            ],
            "widgets": [
                {
                    "kind": "list",
                    "title": "Recent Anomalies",
                    "binding": "recent_anomalies",
                    "empty_copy": "No anomalies",
                },
                {
                    "kind": "table",
                    "title": "Anomaly Details",
                    "binding": "anomaly_details",
                    "empty_copy": "No anomaly rows available",
                },
            ],
            "version": 1,
            "preset_count": len(presets),
        }


@app.get("/agent-card")
def agent_card() -> dict:
    return {
        "name": "business-sentry-dashboard-agent",
        "description": "Generates dashboard specs using LangChain Agent with tools.",
        "endpoint": "/message/send",
        "skills": ["generate_dashboard_spec"],
    }


@app.post("/message/send")
def message_send(payload: A2ARequest) -> dict:
    task_type = payload.params.get("task_type")
    context = payload.params.get("payload", {})

    if task_type != "generate_dashboard_spec":
        raise HTTPException(status_code=400, detail="Unsupported task type")

    logger.info("dashboard_agent_request preset_count=%s", len(context.get("presets", [])))
    started = time.perf_counter()

    result = _generate_dashboard_with_langchain(context)

    latency_ms = int((time.perf_counter() - started) * 1000)
    logger.info("dashboard_agent_done latency_ms=%s", latency_ms)

    return {"jsonrpc": "2.0", "id": payload.id, "result": result}
