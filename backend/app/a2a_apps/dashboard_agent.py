import json
import time
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from langchain_core.callbacks.base import BaseCallbackHandler
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text

from app.core.config import settings
from app.services.agent_artifacts import validate_generated_sql
from app.services.artifact_event_client import emit_remote_artifact_event
from app.services.connector_crypto import decrypt_connector_uri
from app.utils.logging import configure_logging, get_logger


configure_logging()

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


class DashboardQuerySample(BaseModel):
    name: str
    description: str
    module: str | None = None
    validation_status: str | None = None
    query_logic: str
    output_columns: list[str] = Field(default_factory=list)
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)
    sample_error: str | None = None


class DashboardOutlinePage(BaseModel):
    key: str = Field(min_length=1)
    title: str = Field(min_length=1)
    subtitle: str = Field(min_length=1)
    intent: str = Field(min_length=1)


class DashboardOutlineResponse(BaseModel):
    title: str = Field(min_length=1)
    subtitle: str = Field(min_length=1)
    theme_preset: Literal["cobalt", "teal", "amber"] = "cobalt"
    dashboards: list[DashboardOutlinePage] = Field(default_factory=list, min_length=2, max_length=4)


class DashboardBuildOperation(BaseModel):
    op: Literal["add_metric", "add_chart", "add_table", "add_list"]
    title: str = Field(min_length=1)
    subtitle: str = ""
    binding: Literal[
        "preset_count",
        "validated_preset_count",
        "latest_row_count",
        "module_count",
        "preset_summaries",
        "latest_detector_rows",
        "module_preset_counts",
        "module_row_rollup",
        "validation_overview",
        "schedule_distribution",
        "preset_row_counts",
    ]
    chart_type: Literal["bar", "line", "pie"] | None = None
    value_format: Literal["count", "currency", "percent"] = "count"
    tone: Literal["neutral", "positive", "negative", "accent"] = "neutral"
    empty_copy: str = "No data available."


class DashboardPageBuildResponse(BaseModel):
    key: str = Field(min_length=1)
    title: str = Field(min_length=1)
    subtitle: str = Field(min_length=1)
    layout: Literal["hero", "grid", "dense"] = "grid"
    operations: list[DashboardBuildOperation] = Field(
        default_factory=list, min_length=4, max_length=8
    )


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

    def _resolve_connector_uri(raw_uri: str) -> str:
        normalized = raw_uri.strip()
        if normalized.startswith(("postgres://", "postgresql://", "postgresql+psycopg://")):
            return normalized
        return decrypt_connector_uri(normalized)

    def _json_safe_value(value: Any) -> Any:
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        return str(value)

    def _sample_preset_queries() -> list[DashboardQuerySample]:
        raw_uri = str(connector.get("uri") or "").strip()
        if not raw_uri:
            emit_remote_artifact_event(
                connector_id,
                kind="trace",
                stage="sql_sampling_skipped",
                agent="dashboard_agent",
                status="running",
                message="No connector URI available; dashboard agent cannot sample SQL outputs.",
            )
            return []

        uri = _resolve_connector_uri(raw_uri)
        engine = create_engine(uri, future=True, pool_pre_ping=True)
        samples: list[DashboardQuerySample] = []
        try:
            with engine.begin() as connection:
                connection.execute(text("SET TRANSACTION READ ONLY"))
                connection.execute(
                    text(
                        f"SET LOCAL statement_timeout = {int(settings.source_query_statement_timeout_ms)}"
                    )
                )
                for preset in presets[:8]:
                    query_logic = str(preset.get("query_logic") or "").strip()
                    is_valid, validation_message = validate_generated_sql(query_logic)
                    sample = DashboardQuerySample(
                        name=str(preset.get("name") or "Unnamed preset"),
                        description=str(preset.get("description") or ""),
                        module=preset.get("module"),
                        validation_status=preset.get("validation_status") or validation_message,
                        query_logic=query_logic,
                    )
                    if not is_valid:
                        sample.sample_error = validation_message
                        samples.append(sample)
                        continue

                    preview_sql = query_logic.rstrip().rstrip(";")
                    try:
                        result = connection.execute(
                            text(
                                f"SELECT * FROM ({preview_sql}) AS dashboard_agent_preview LIMIT 5"
                            )
                        )
                        rows = result.mappings().all()
                        sample.output_columns = list(result.keys())
                        sample.sample_rows = [
                            {key: _json_safe_value(value) for key, value in dict(row).items()}
                            for row in rows
                        ]
                    except Exception as exc:
                        sample.sample_error = f"{exc.__class__.__name__}: {exc}"
                    samples.append(sample)
        finally:
            engine.dispose()
        return samples

    if not settings.gemini_api_key and not settings.cerebras_api_key:
        raise ValueError("GEMINI_API_KEY or CEREBRAS_API_KEY required")

    if settings.gemini_api_key:
        llm = _build_gemini_llm()
        logger.info("dashboard_agent_using_llm model=gemini")
    else:
        llm = _build_llm()
        logger.info("dashboard_agent_using_llm model=cerebras")

    trace_handler = AgentTraceCallbackHandler(connector_id, "dashboard_agent")
    logger.info("dashboard_agent_generating_spec")

    emit_remote_artifact_event(
        connector_id,
        kind="trace",
        stage="sql_sampling",
        agent="dashboard_agent",
        status="running",
        message="Sampling validated preset queries to infer dashboard bindings.",
        detail={"preset_count": len(presets)},
    )
    query_samples = _sample_preset_queries()

    preset_context = json.dumps(
        [
            {
                "name": p.get("name"),
                "description": p.get("description"),
                "module": p.get("module"),
                "schedule_minutes": p.get("schedule_minutes"),
                "validation_status": p.get("validation_status"),
                "query_logic": p.get("query_logic"),
            }
            for p in presets[:8]
        ],
        indent=2,
    )
    sample_context = json.dumps([item.model_dump() for item in query_samples], indent=2)
    binding_guide = """
Available metric bindings:
- preset_count
- validated_preset_count
- latest_row_count
- module_count

Available widget bindings:
- preset_summaries: detector inventory table/list
- latest_detector_rows: sampled output rows from the strongest detectors
- module_preset_counts: number of presets per module
- module_row_rollup: total latest detector rows per module
- validation_overview: validated / needs review / enabled summary
- schedule_distribution: detector cadence buckets
- preset_row_counts: row count per preset
"""

    outline_llm = llm.with_structured_output(DashboardOutlineResponse)
    emit_remote_artifact_event(
        connector_id,
        kind="trace",
        stage="dashboard_outline",
        agent="dashboard_agent",
        status="running",
        message="Planning a multi-dashboard layout instead of a single flat page.",
        detail={"preset_count": len(presets), "sampled_queries": len(query_samples)},
    )

    def _fallback_outline() -> DashboardOutlineResponse:
        return DashboardOutlineResponse(
            title=f"Anomaly Monitoring — {len(presets)} presets",
            subtitle="Auto-generated overview, operations, and quality dashboards.",
            theme_preset="cobalt",
            dashboards=[
                DashboardOutlinePage(
                    key="overview",
                    title="Overview",
                    subtitle="Executive summary of detector inventory and output.",
                    intent="High-level snapshot of presets, validation, and module coverage.",
                ),
                DashboardOutlinePage(
                    key="operations",
                    title="Operations",
                    subtitle="Detector scheduling, cadence, and live output volume.",
                    intent="Monitor detector cadence, row output, and operational cadence.",
                ),
                DashboardOutlinePage(
                    key="quality",
                    title="Quality & Coverage",
                    subtitle="Validation status, module coverage, and detector health.",
                    intent="Check validation pass rate and module-by-module detector health.",
                ),
            ],
        )

    try:
        outline = outline_llm.invoke(
            f"""You are designing a polished anomaly monitoring workspace for a data-driven organization.

Create a dashboard outline with 2-4 distinct dashboard tabs/views. Be specific.

Context:
- Summary: {summary_text}
- Dashboard brief: {dashboard_brief}
- Presets (detectors):
{preset_context}
- Sampled query outputs:
{sample_context}

Design goals:
- Do NOT collapse everything into one dashboard. Create 2-4 views.
- The first dashboard MUST be an executive/overview surface with top-line metrics.
- At least one dashboard MUST focus on operational detail: scheduling, row counts, cadence.
- At least one dashboard MUST emphasize detector quality, validation status, or module coverage.
- Choose a single theme_preset (cobalt, teal, or amber) that fits the data.
- Each dashboard title should be concise (1-3 words).
- Each dashboard subtitle should explain what the user will see.
""",
            config={"callbacks": [trace_handler]},
        )
    except Exception:
        logger.warning("dashboard_agent_outline_fallback", exc_info=True)
        outline = _fallback_outline()

    page_llm = llm.with_structured_output(DashboardPageBuildResponse)
    page_specs: list[dict[str, Any]] = []

    def _validate_page_operations(operations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Ensure at least 4 ops and at least one chart."""
        ops = list(operations)
        chart_count = sum(1 for o in ops if o.get("op") == "add_chart")
        if chart_count == 0:
            ops.append(
                {
                    "op": "add_chart",
                    "title": "Module Presets",
                    "subtitle": "Preset count by module.",
                    "binding": "module_preset_counts",
                    "chart_type": "bar",
                    "value_format": "count",
                    "tone": "accent",
                    "empty_copy": "No modules detected yet.",
                }
            )
        if len(ops) < 4:
            fill_bindings = ["schedule_distribution", "preset_row_counts", "module_row_rollup"]
            for fb in fill_bindings:
                if len(ops) >= 4:
                    break
                existing_bindings = {o.get("binding") for o in ops}
                if fb not in existing_bindings:
                    ops.append(
                        {
                            "op": "add_chart",
                            "title": fb.replace("_", " ").title(),
                            "binding": fb,
                            "chart_type": "pie" if fb == "schedule_distribution" else "bar",
                            "value_format": "count",
                            "tone": "neutral",
                            "empty_copy": "No data yet.",
                        }
                    )
        return ops[:8]

    for page in outline.dashboards:
        emit_remote_artifact_event(
            connector_id,
            kind="trace",
            stage="dashboard_page",
            agent="dashboard_agent",
            status="running",
            message=f"Designing dashboard view `{page.title}`.",
            detail={"dashboard_key": page.key},
        )
        try:
            page_spec = page_llm.invoke(
                f"""Design one anomaly monitoring dashboard view as a sequence of operations.

Dashboard view:
- key: {page.key}
- title: {page.title}
- subtitle: {page.subtitle}
- intent: {page.intent}

Context:
- Summary: {summary_text}
- Dashboard brief: {dashboard_brief}
- Presets (detectors):
{preset_context}
- Sampled query outputs:
{sample_context}

{binding_guide}

Rules:
- Produce 4-8 operations total.
- Use a mix of metrics, charts, tables, and lists. DO NOT make everything a table.
- Include at least 2 charts (add_chart) per view. Allowed chart types: bar, line, pie.
- Use at least 1 metric (add_metric) per view.
- Chart bindings that work even before detector runs: module_preset_counts, validation_overview, schedule_distribution.
- Tables should be used for detector inventory (preset_summaries) or sampled rows (latest_detector_rows).
- Lists should be short (3-6 items), not exhaustive.
- Use compact, business-facing titles (2-5 words).
""",
                config={"callbacks": [trace_handler]},
            )
            raw_ops = page_spec.model_dump()
        except Exception:
            logger.warning("dashboard_agent_page_fallback key=%s", page.key, exc_info=True)
            raw_ops = {
                "key": page.key,
                "title": page.title,
                "subtitle": page.subtitle,
                "layout": "grid",
                "operations": [
                    {
                        "op": "add_metric",
                        "title": "Total Presets",
                        "binding": "preset_count",
                        "value_format": "count",
                        "tone": "accent",
                    },
                    {
                        "op": "add_metric",
                        "title": "Modules",
                        "binding": "module_count",
                        "value_format": "count",
                        "tone": "neutral",
                    },
                    {
                        "op": "add_chart",
                        "title": "Module Presets",
                        "binding": "module_preset_counts",
                        "chart_type": "bar",
                        "value_format": "count",
                        "tone": "accent",
                    },
                    {
                        "op": "add_chart",
                        "title": "Schedule Cadence",
                        "binding": "schedule_distribution",
                        "chart_type": "pie",
                        "value_format": "count",
                        "tone": "neutral",
                    },
                    {
                        "op": "add_list",
                        "title": "Detector Inventory",
                        "binding": "preset_summaries",
                        "value_format": "count",
                        "tone": "neutral",
                    },
                ],
            }

        validated_ops = _validate_page_operations(raw_ops.get("operations") or [])
        raw_ops["operations"] = validated_ops
        page_specs.append(raw_ops)

    logger.info("dashboard_agent_spec_generated")
    return {
        "title": outline.title,
        "subtitle": outline.subtitle,
        "theme_preset": outline.theme_preset,
        "dashboards": page_specs,
        "version": 2,
        "preset_count": len(presets),
    }


@app.get("/agent-card")
def agent_card() -> dict:
    return {
        "name": "business-sentry-dashboard-agent",
        "description": "Generates dashboard specs using structured multi-pass planning.",
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
