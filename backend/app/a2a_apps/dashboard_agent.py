import json
import time
from typing import Annotated, Any, Literal

from fastapi import FastAPI, HTTPException
from langchain_core.tools import tool
from langchain_core.tools import InjectedToolArg
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

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


# ---------------------------------------------------------------------------
# Runtime context schema — propagated to all subagents and tools via config
# ---------------------------------------------------------------------------


class DashboardAgentContext(BaseModel):
    connector_id: int
    connector_uri: str
    connector_name: str
    org_id: str
    presets_json: str = ""
    summary_text: str = ""
    dashboard_brief: str = ""


# ---------------------------------------------------------------------------
# Structured-output models (unchanged contract from original agent)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_connector_uri(raw_uri: str) -> str:
    normalized = raw_uri.strip()
    if not normalized:
        raise ValueError("Connector URI is required")
    if normalized.startswith(("postgres://", "postgresql://", "postgresql+psycopg://")):
        return normalized
    return decrypt_connector_uri(normalized)


def _json_safe_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _emit_event(
    connector_id: int, stage: str, message: str, detail: dict[str, Any] | None = None
) -> None:
    emit_remote_artifact_event(
        connector_id,
        kind="trace",
        stage=stage,
        agent="dashboard_agent",
        status="running",
        message=message,
        detail=detail,
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


def _get_llm():
    if settings.gemini_api_key:
        return _build_gemini_llm()
    return _build_llm()


# ---------------------------------------------------------------------------
# Custom tools — available to the main agent and all subagents
# ---------------------------------------------------------------------------


@tool
def get_presets_info(config: Annotated[RunnableConfig, InjectedToolArg]) -> str:
    """Get the list of anomaly detection presets with their names, descriptions, modules, and schedules."""
    ctx = config.get("context", {})
    presets_raw = ctx.get("presets_json", "[]")
    try:
        presets = json.loads(presets_raw)
    except (json.JSONDecodeError, TypeError):
        presets = []
    return json.dumps(presets, indent=2)


@tool
def sample_preset_query(
    preset_name: str, config: Annotated[RunnableConfig, InjectedToolArg]
) -> str:
    """Execute a preset's SQL query in read-only mode and return up to 5 sample rows.
    Use this to understand the actual data shape before designing dashboard widgets."""
    from sqlalchemy import create_engine, text

    ctx = config.get("context", {})
    raw_uri = str(ctx.get("connector_uri", "") or "")
    if not raw_uri.strip():
        return json.dumps({"error": "Connector URI missing"})
    uri = _resolve_connector_uri(raw_uri)
    connector_id = ctx.get("connector_id", 0)

    presets_raw = ctx.get("presets_json", "[]")
    try:
        presets = json.loads(presets_raw)
    except (json.JSONDecodeError, TypeError):
        return json.dumps({"error": "No presets available"})

    target_preset = None
    for p in presets:
        if p.get("name", "").lower() == preset_name.lower():
            target_preset = p
            break
    if not target_preset:
        return json.dumps({"error": f"Preset '{preset_name}' not found"})

    query_logic = str(
        target_preset.get("query_logic") or target_preset.get("sql_text") or ""
    ).strip()
    if not query_logic:
        return json.dumps({"error": "Preset has no query logic"})

    is_valid, validation_msg = validate_generated_sql(query_logic)
    if not is_valid:
        return json.dumps({"error": f"Validation failed: {validation_msg}", "preset": preset_name})

    engine = create_engine(uri, future=True, pool_pre_ping=True)
    try:
        with engine.begin() as connection:
            connection.execute(text("SET TRANSACTION READ ONLY"))
            connection.execute(
                text(
                    f"SET LOCAL statement_timeout = "
                    f"{int(settings.source_query_statement_timeout_ms)}"
                )
            )
            preview_sql = query_logic.rstrip().rstrip(";")
            result = connection.execute(
                text(f"SELECT * FROM ({preview_sql}) AS _da_sample LIMIT 5")
            )
            rows = [
                {k: _json_safe_value(v) for k, v in dict(row).items()}
                for row in result.mappings().all()
            ]
            columns = list(result.keys())

        _emit_event(
            int(connector_id),
            "sql_sampling",
            f"Sampled {len(rows)} rows from preset '{preset_name}'.",
        )

        return json.dumps(
            {
                "preset": preset_name,
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
            },
            indent=2,
        )
    except Exception as exc:
        return json.dumps({"error": f"{exc.__class__.__name__}: {exc}", "preset": preset_name})
    finally:
        engine.dispose()


@tool
def sample_all_presets(config: Annotated[RunnableConfig, InjectedToolArg]) -> str:
    """Execute ALL preset SQL queries in read-only mode and return sample rows for each.
    This is the most efficient way to get data samples for all presets at once."""
    from sqlalchemy import create_engine, text

    ctx = config.get("context", {})
    raw_uri = str(ctx.get("connector_uri", "") or "")
    if not raw_uri.strip():
        return json.dumps({"error": "Connector URI missing"})
    uri = _resolve_connector_uri(raw_uri)
    connector_id = ctx.get("connector_id", 0)

    presets_raw = ctx.get("presets_json", "[]")
    try:
        presets = json.loads(presets_raw)
    except (json.JSONDecodeError, TypeError):
        return json.dumps({"error": "No presets available"})

    samples = []
    engine = create_engine(uri, future=True, pool_pre_ping=True)
    try:
        with engine.begin() as connection:
            connection.execute(text("SET TRANSACTION READ ONLY"))
            connection.execute(
                text(
                    f"SET LOCAL statement_timeout = "
                    f"{int(settings.source_query_statement_timeout_ms)}"
                )
            )
            for preset in presets[:8]:
                name = str(preset.get("name") or "Unnamed preset")
                query_logic = str(preset.get("query_logic") or preset.get("sql_text") or "").strip()

                is_valid, validation_msg = validate_generated_sql(query_logic)
                sample = {
                    "name": name,
                    "description": preset.get("description", ""),
                    "module": preset.get("module"),
                    "validation_status": preset.get("validation_status") or validation_msg,
                    "query_logic": query_logic,
                    "output_columns": [],
                    "sample_rows": [],
                    "sample_error": None,
                }
                if not is_valid:
                    sample["sample_error"] = validation_msg
                    samples.append(sample)
                    continue

                preview_sql = query_logic.rstrip().rstrip(";")
                try:
                    result = connection.execute(
                        text(f"SELECT * FROM ({preview_sql}) AS _da_sample LIMIT 5")
                    )
                    rows = result.mappings().all()
                    sample["output_columns"] = list(result.keys())
                    sample["sample_rows"] = [
                        {k: _json_safe_value(v) for k, v in dict(row).items()} for row in rows
                    ]
                except Exception as exc:
                    sample["sample_error"] = f"{exc.__class__.__name__}: {exc}"
                samples.append(sample)

        _emit_event(
            int(connector_id),
            "sql_sampling",
            f"Sampled {len(samples)} presets.",
            {"preset_count": len(samples)},
        )
    finally:
        engine.dispose()

    return json.dumps(samples, indent=2)


@tool
def get_binding_guide() -> str:
    """Returns the available dashboard metric and widget bindings that can be used in dashboard operations."""
    return """Available metric bindings:
- preset_count: Total number of presets
- validated_preset_count: Number of validated presets
- latest_row_count: Total rows from latest detector run
- module_count: Number of distinct modules

Available widget bindings:
- preset_summaries: Detector inventory table/list
- latest_detector_rows: Sampled output rows from strongest detectors
- module_preset_counts: Number of presets per module (chart-friendly)
- module_row_rollup: Total latest detector rows per module (chart-friendly)
- validation_overview: Validated / needs review / enabled summary (chart-friendly)
- schedule_distribution: Detector cadence buckets (chart-friendly)
- preset_row_counts: Row count per preset (chart-friendly)
"""


# ---------------------------------------------------------------------------
# Subagent definitions
# ---------------------------------------------------------------------------

OUTLINE_PLANNER_PROMPT = """\
You are a dashboard layout planner for an anomaly monitoring platform. \
Your job is to design a multi-dashboard workspace (2-4 dashboard views) \
from the available anomaly detection presets and their sample data.

Workflow:
1. Use `get_presets_info` to understand what detectors are configured.
2. Use `sample_all_presets` to see actual data shapes and row counts.
3. Design 2-4 distinct dashboard views:
   - The FIRST dashboard MUST be an executive/overview surface with top-line metrics.
   - At least one MUST focus on operational detail: scheduling, cadence, row output.
   - At least one MUST emphasize detector quality, validation, or module coverage.
4. Return a JSON object with this exact structure:
   {{
     "title": "Anomaly Monitoring — X presets",
     "subtitle": "Auto-generated overview, operations, and quality dashboards.",
     "theme_preset": "cobalt",
     "dashboards": [
       {{"key": "overview", "title": "Overview", "subtitle": "...", "intent": "..."}},
       {{"key": "operations", "title": "Operations", "subtitle": "...", "intent": "..."}},
       {{"key": "quality", "title": "Quality & Coverage", "subtitle": "...", "intent": "..."}}
     ]
   }}

Design principles:
- Dashboard titles should be 1-3 words.
- Subtitles should explain what the user will see.
- Intents should be one sentence describing the purpose.
- theme_preset must be "cobalt", "teal", or "amber".
"""

outline_planner = {
    "name": "outline-planner",
    "description": "Designs a multi-dashboard layout (2-4 views) from anomaly detection presets "
    "and their sample data. Returns a structured outline with key, title, subtitle, "
    "and intent for each dashboard view. Use this as the first step in dashboard generation.",
    "system_prompt": OUTLINE_PLANNER_PROMPT,
    "tools": [get_presets_info, sample_all_presets, sample_preset_query],
}

PAGE_BUILDER_PROMPT = """\
You are a dashboard widget designer for an anomaly monitoring platform. \
Your job is to design the widgets (operations) for a single dashboard view.

You will receive the dashboard view spec (key, title, subtitle, intent) \
and the available presets. Use `get_presets_info` and `sample_all_presets` \
to understand the data, then `get_binding_guide` to know available bindings.

Design 4-8 operations per dashboard view:
- Use a mix of metrics, charts, tables, and lists.
- Include at least 2 charts (add_chart) per view. Allowed chart types: bar, line, pie.
- Include at least 1 metric (add_metric) per view.
- Chart bindings that work before detector runs: module_preset_counts, validation_overview, \
  schedule_distribution.
- Tables: use for detector inventory (preset_summaries) or sampled rows (latest_detector_rows).
- Lists: short (3-6 items), not exhaustive.
- Use compact, business-facing titles (2-5 words).

Return a JSON object:
{{
  "key": "<dashboard_key>",
  "title": "<dashboard_title>",
  "subtitle": "<dashboard_subtitle>",
  "layout": "grid",
  "operations": [
    {{"op": "add_metric", "title": "...", "binding": "preset_count", "value_format": "count", "tone": "accent"}},
    {{"op": "add_chart", "title": "...", "binding": "module_preset_counts", "chart_type": "bar", ...}},
    ...
  ]
}}

Each operation must have: op, title, binding. Optional: subtitle, chart_type, value_format, tone, empty_copy.
"""

page_builder = {
    "name": "page-builder",
    "description": "Designs the widget operations (metrics, charts, tables, lists) for a single "
    "dashboard view. Takes the view spec and available presets, returns a structured "
    "page build response with 4-8 operations. Use this for each dashboard page.",
    "system_prompt": PAGE_BUILDER_PROMPT,
    "tools": [get_presets_info, sample_all_presets, sample_preset_query, get_binding_guide],
}


# ---------------------------------------------------------------------------
# Agent construction
# ---------------------------------------------------------------------------

MAIN_SYSTEM_PROMPT = """\
You are the Dashboard Agent, an orchestrator for generating anomaly monitoring \
dashboards. You coordinate specialized subagents to plan layouts and build \
dashboard pages.

Available subagents:
- `outline-planner`: Designs a multi-dashboard layout (2-4 views) from presets \
  and sample data. Returns a structured outline.
- `page-builder`: Designs the widget operations for a single dashboard view.

Workflow:
1. First, delegate to `outline-planner` to design the dashboard outline.
2. Parse the outline JSON to get the list of dashboard views.
3. For EACH dashboard view, delegate to `page-builder` to design its widgets.
4. Collect all page specs and return the complete dashboard specification.

Always use subagents for complex multi-step work to keep your context clean.
The final output should be a complete dashboard specification with all pages.
"""


def _build_dashboard_agent():
    """Build the Deep Agent for dashboard generation."""
    from deepagents import create_deep_agent

    llm = _get_llm()
    llm_name = "gemini" if settings.gemini_api_key else "cerebras"
    logger.info("dashboard_agent_building model=%s", llm_name)

    agent = create_deep_agent(
        model=llm,
        tools=[get_presets_info, sample_preset_query, sample_all_presets, get_binding_guide],
        system_prompt=MAIN_SYSTEM_PROMPT,
        subagents=[outline_planner, page_builder],
        context_schema=DashboardAgentContext,
        name="dashboard-agent",
    )
    return agent


# Cache the compiled agent (one per process)
_dashboard_agent = None


def _get_dashboard_agent():
    global _dashboard_agent
    if _dashboard_agent is None:
        _dashboard_agent = _build_dashboard_agent()
    return _dashboard_agent


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


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


def _fallback_outline() -> dict[str, Any]:
    return {
        "title": "Anomaly Monitoring Dashboard",
        "subtitle": "Auto-generated overview, operations, and quality dashboards.",
        "theme_preset": "cobalt",
        "dashboards": [
            {
                "key": "overview",
                "title": "Overview",
                "subtitle": "Executive summary of detector inventory and output.",
                "intent": "High-level snapshot of presets, validation, and module coverage.",
            },
            {
                "key": "operations",
                "title": "Operations",
                "subtitle": "Detector scheduling, cadence, and live output volume.",
                "intent": "Monitor detector cadence, row output, and operational cadence.",
            },
            {
                "key": "quality",
                "title": "Quality & Coverage",
                "subtitle": "Validation status, module coverage, and detector health.",
                "intent": "Check validation pass rate and module-by-module detector health.",
            },
        ],
    }


def _fallback_page(page: dict[str, Any]) -> dict[str, Any]:
    return {
        "key": page.get("key", "page"),
        "title": page.get("title", "Dashboard"),
        "subtitle": page.get("subtitle", ""),
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


# ---------------------------------------------------------------------------
# Output parsing helpers
# ---------------------------------------------------------------------------


def _extract_last_message(result: Any) -> str:
    """Extract the last AI message content from agent invocation result."""
    messages = result.get("messages", []) if isinstance(result, dict) else []
    for msg in reversed(messages):
        content = getattr(msg, "content", None) or (
            msg.get("content") if isinstance(msg, dict) else None
        )
        if content and isinstance(content, str) and content.strip():
            return content.strip()
        if content and isinstance(content, list):
            texts = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("text")]
            joined = "\n".join(t for t in texts if t.strip())
            if joined.strip():
                return joined.strip()
    return ""


def _extract_json_object(text: str) -> dict[str, Any] | None:
    """Extract a JSON object from agent output text."""
    import re

    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text, re.IGNORECASE)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except (json.JSONDecodeError, TypeError):
            pass

    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            obj = json.loads(match.group())
            if isinstance(obj, dict):
                return obj
        except (json.JSONDecodeError, TypeError):
            pass
    return None


def _extract_json_array(text: str) -> list[dict[str, Any]] | None:
    """Extract a JSON array from agent output text."""
    import re

    fenced = re.search(r"```(?:json)?\s*(\[[\s\S]*?\])\s*```", text, re.IGNORECASE)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except (json.JSONDecodeError, TypeError):
            pass

    match = re.search(r"\[[\s\S]*\]", text)
    if match:
        try:
            arr = json.loads(match.group())
            if isinstance(arr, list):
                return arr
        except (json.JSONDecodeError, TypeError):
            pass
    return None


# ---------------------------------------------------------------------------
# Main generation function
# ---------------------------------------------------------------------------


def _generate_dashboard_with_deep_agent(context: dict[str, Any]) -> dict[str, Any]:
    presets = context.get("presets", [])
    summary_text = context.get("summary_text", "")
    dashboard_brief = context.get("dashboard_brief", "")
    connector = context.get("connector", {})
    connector_id = int(connector.get("id") or 0)

    if not settings.gemini_api_key and not settings.cerebras_api_key:
        raise ValueError("GEMINI_API_KEY or CEREBRAS_API_KEY required")

    raw_uri = str(connector.get("uri") or "").strip()
    uri = _resolve_connector_uri(raw_uri) if raw_uri else ""
    connector_name = str(connector.get("name") or "")
    org_id = str(
        context.get("org_id")
        or context.get("organization_id")
        or connector.get("organization_id")
        or ""
    )

    logger.info("dashboard_agent_generating_spec preset_count=%s", len(presets))

    agent_context = {
        "connector_id": connector_id,
        "connector_uri": uri,
        "connector_name": connector_name,
        "org_id": org_id,
        "presets_json": json.dumps(
            [
                {
                    "name": p.get("name"),
                    "description": p.get("description"),
                    "module": p.get("module"),
                    "schedule_minutes": p.get("schedule_minutes"),
                    "validation_status": p.get("validation_status"),
                    "query_logic": p.get("query_logic") or p.get("sql_text"),
                }
                for p in presets[:8]
            ],
            indent=2,
        ),
        "summary_text": summary_text,
        "dashboard_brief": dashboard_brief,
    }

    _emit_event(
        connector_id,
        "sql_sampling",
        "Sampling validated preset queries to infer dashboard bindings.",
        {"preset_count": len(presets)},
    )

    agent = _get_dashboard_agent()

    # --- Step 1: Generate dashboard outline via Deep Agent ---
    _emit_event(
        connector_id,
        "dashboard_outline",
        "Planning a multi-dashboard layout via Deep Agent.",
        {"preset_count": len(presets)},
    )

    outline_result = agent.invoke(
        {
            "messages": [
                {
                    "role": "user",
                    "content": (
                        f"Design a dashboard outline for an anomaly monitoring workspace.\n\n"
                        f"Context:\n"
                        f"- Summary: {summary_text[:1500]}\n"
                        f"- Dashboard brief: {dashboard_brief}\n"
                        f"- Number of presets: {len(presets)}\n\n"
                        "Use the `task` tool to delegate to the `outline-planner` subagent. "
                        "Sample all preset queries to understand the data, then design "
                        "2-4 distinct dashboard views. Return the outline as JSON."
                    ),
                }
            ],
        },
        {"context": agent_context},
    )

    outline_text = _extract_last_message(outline_result)
    outline_data = _extract_json_object(outline_text)

    if not outline_data or "dashboards" not in outline_data:
        logger.warning("dashboard_agent_outline_parse_fallback")
        outline_data = _fallback_outline()

    # Validate outline structure
    dashboards = outline_data.get("dashboards", [])
    if not isinstance(dashboards, list) or len(dashboards) < 2:
        logger.warning("dashboard_agent_outline_invalid, using fallback")
        outline_data = _fallback_outline()
        dashboards = outline_data.get("dashboards", [])

    theme_preset = outline_data.get("theme_preset", "cobalt")
    if theme_preset not in {"cobalt", "teal", "amber"}:
        theme_preset = "cobalt"

    # --- Step 2: Build each dashboard page via Deep Agent ---
    page_specs: list[dict[str, Any]] = []

    for page in dashboards:
        page_key = page.get("key", "page")
        page_title = page.get("title", "Dashboard")

        _emit_event(
            connector_id,
            "dashboard_page",
            f"Designing dashboard view `{page_title}`.",
            {"dashboard_key": page_key},
        )

        page_result = agent.invoke(
            {
                "messages": [
                    {
                        "role": "user",
                        "content": (
                            f"Design the widget operations for this dashboard view:\n\n"
                            f"- key: {page_key}\n"
                            f"- title: {page_title}\n"
                            f"- subtitle: {page.get('subtitle', '')}\n"
                            f"- intent: {page.get('intent', '')}\n\n"
                            f"Context:\n"
                            f"- Summary: {summary_text[:1000]}\n"
                            f"- Dashboard brief: {dashboard_brief}\n"
                            f"- Number of presets: {len(presets)}\n\n"
                            "Use the `task` tool to delegate to the `page-builder` subagent. "
                            "Use get_binding_guide to see available bindings. "
                            "Sample preset data if needed. "
                            "Design 4-8 operations with a mix of metrics, charts, tables, and lists. "
                            "Return the page spec as JSON."
                        ),
                    }
                ],
            },
            {"context": agent_context},
        )

        page_text = _extract_last_message(page_result)
        page_data = _extract_json_object(page_text)

        if page_data and "operations" in page_data:
            ops = page_data.get("operations", [])
            if isinstance(ops, list):
                page_data["operations"] = _validate_page_operations(ops)
            else:
                page_data["operations"] = _validate_page_operations([])
            page_specs.append(page_data)
        else:
            logger.warning("dashboard_agent_page_parse_fallback key=%s", page_key)
            fallback = _fallback_page(page)
            fallback["operations"] = _validate_page_operations(fallback["operations"])
            page_specs.append(fallback)

    logger.info("dashboard_agent_spec_generated pages=%s", len(page_specs))

    return {
        "title": outline_data.get("title", "Anomaly Monitoring"),
        "subtitle": outline_data.get("subtitle", ""),
        "theme_preset": theme_preset,
        "dashboards": page_specs,
        "version": 2,
        "preset_count": len(presets),
    }


# ---------------------------------------------------------------------------
# A2A endpoints
# ---------------------------------------------------------------------------


@app.get("/agent-card")
def agent_card() -> dict:
    return {
        "name": "business-sentry-dashboard-agent",
        "description": "Generates dashboard specs using Deep Agent with specialized subagents for layout planning and page building.",
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
    result = _generate_dashboard_with_deep_agent(context)
    latency_ms = int((time.perf_counter() - started) * 1000)
    logger.info("dashboard_agent_done latency_ms=%s", latency_ms)
    return {"jsonrpc": "2.0", "id": payload.id, "result": result}
