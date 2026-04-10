import json
import time
from typing import Annotated, Any

from fastapi import FastAPI, HTTPException
from langchain_core.tools import tool
from langchain_core.tools import InjectedToolArg
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.artifact_event_client import emit_remote_artifact_event
from app.services.copilot_event_client import emit_remote_copilot_event
from app.services.connector_crypto import decrypt_connector_uri
from app.services.agent_artifacts import validate_generated_sql
from app.utils.logging import configure_logging, get_logger


configure_logging()

logger = get_logger("app.sql_agent")


class A2ARequest(BaseModel):
    jsonrpc: str = "2.0"
    id: str
    method: str
    params: dict


app = FastAPI(title="Business Sentry SQL Agent")


# ---------------------------------------------------------------------------
# Runtime context schema — propagated to all subagents and tools via config
# ---------------------------------------------------------------------------


class SqlAgentContext(BaseModel):
    connector_id: int
    connector_uri: str
    connector_name: str
    org_id: str
    session_id: str | None = None
    relation_names: list[str] = Field(default_factory=list)
    memory_summary: str = ""
    memory_dashboard_brief: str = ""
    memory_schema_notes: str = ""


# ---------------------------------------------------------------------------
# Structured-output models (unchanged contract)
# ---------------------------------------------------------------------------


class SqlPreset(BaseModel):
    name: str = Field(min_length=1)
    description: str = Field(min_length=1)
    category: str = Field(min_length=1)
    sql_text: str = Field(min_length=1)
    schedule_minutes: int = Field(ge=15, le=1440)
    expected_output_fields: list[str] = Field(default_factory=list)
    linked_action_template: str = Field(min_length=1)
    linked_cost_formula: str = Field(min_length=1)


class SqlPresetBatch(BaseModel):
    presets: list[SqlPreset] = Field(default_factory=list, min_length=1, max_length=6)


class SchemaTableInsight(BaseModel):
    qualified_name: str = Field(min_length=1)
    purpose: str = Field(min_length=1)
    key_columns: list[str] = Field(default_factory=list)


class SchemaSummaryResponse(BaseModel):
    business_summary: str = Field(min_length=1)
    operational_scope: str = Field(min_length=1)
    key_tables: list[SchemaTableInsight] = Field(default_factory=list)
    anomaly_focus_areas: list[str] = Field(default_factory=list)
    join_paths: list[str] = Field(default_factory=list)
    dashboard_brief: str = Field(min_length=1)
    schema_notes: list[str] = Field(default_factory=list)


class CopilotAnswerResponse(BaseModel):
    query_label: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    explanation: str = Field(min_length=1)


# ---------------------------------------------------------------------------
# Event helpers
# ---------------------------------------------------------------------------


def _emit_artifact_event(
    connector_id: int, stage: str, message: str, detail: dict[str, Any] | None = None
) -> None:
    emit_remote_artifact_event(
        connector_id,
        kind="trace",
        stage=stage,
        agent="sql_agent",
        status="running",
        message=message,
        detail=detail,
    )


def _emit_copilot_event(
    session_id: str | None,
    message: str,
    detail: dict[str, Any] | None = None,
    kind: str = "reasoning",
) -> None:
    if not session_id:
        return
    emit_remote_copilot_event(
        session_id,
        kind=kind,
        message=message,
        detail=detail,
        status="running",
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
def list_tables(config: Annotated[RunnableConfig, InjectedToolArg]) -> str:
    """List all tables and views in the connected database."""
    from sqlalchemy import create_engine, inspect as sa_inspect

    ctx = config.get("context", {})
    raw_uri = str(ctx.get("connector_uri", "") or "")
    if not raw_uri.strip():
        return json.dumps({"error": "Connector URI missing"})
    uri = _resolve_connector_uri(raw_uri)
    engine = create_engine(uri, future=True, pool_pre_ping=True)
    try:
        inspector = sa_inspect(engine)
        tables = inspector.get_table_names()
        views = inspector.get_view_names()
        result = {"tables": tables[:80], "views": views[:40]}
        return json.dumps(result, indent=2)
    finally:
        engine.dispose()


@tool
def get_table_schema(table_name: str, config: Annotated[RunnableConfig, InjectedToolArg]) -> str:
    """Get column names, types, and constraints for a specific table or view."""
    from sqlalchemy import create_engine, inspect as sa_inspect

    ctx = config.get("context", {})
    raw_uri = str(ctx.get("connector_uri", "") or "")
    if not raw_uri.strip():
        return json.dumps({"error": "Connector URI missing"})
    uri = _resolve_connector_uri(raw_uri)
    engine = create_engine(uri, future=True, pool_pre_ping=True)
    try:
        inspector = sa_inspect(engine)
        columns = inspector.get_columns(table_name)
        pk = inspector.get_pk_constraint(table_name)
        fks = inspector.get_foreign_keys(table_name)
        schema_info = {
            "table": table_name,
            "columns": [
                {"name": c["name"], "type": str(c["type"]), "nullable": c.get("nullable", True)}
                for c in columns
            ],
            "primary_key": pk.get("constrained_columns", []),
            "foreign_keys": [
                {"columns": fk["constrained_columns"], "references": fk["referred_table"]}
                for fk in fks
            ],
        }
        return json.dumps(schema_info, indent=2)
    finally:
        engine.dispose()


@tool
def execute_readonly_sql(
    sql: str, limit: int, config: Annotated[RunnableConfig, InjectedToolArg]
) -> str:
    """Execute a read-only SQL query and return up to `limit` rows as JSON.

    The query is wrapped in SELECT * FROM (...) AS _da LIMIT <limit> inside
    a read-only transaction with a statement timeout.
    """
    from sqlalchemy import create_engine, text

    ctx = config.get("context", {})
    raw_uri = str(ctx.get("connector_uri", "") or "")
    if not raw_uri.strip():
        return json.dumps({"error": "Connector URI missing"})
    uri = _resolve_connector_uri(raw_uri)
    connector_id = ctx.get("connector_id", 0)
    session_id = ctx.get("session_id")

    is_valid, validation_msg = validate_generated_sql(sql)
    if not is_valid:
        return json.dumps({"error": f"SQL validation failed: {validation_msg}"})

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
            inner_sql = sql.rstrip().rstrip(";")
            wrapped = f"SELECT * FROM ({inner_sql}) AS _da LIMIT {int(limit)}"
            result = connection.execute(text(wrapped))
            rows = [
                {k: _json_safe_value(v) for k, v in dict(row).items()}
                for row in result.mappings().all()
            ]
            columns = list(result.keys())

        _emit_artifact_event(
            int(connector_id),
            "sql_execution",
            f"Executed SQL, returned {len(rows)} rows.",
            {"row_count": len(rows)},
        )
        _emit_copilot_event(
            session_id,
            f"Executed SQL, returned {len(rows)} rows.",
            {"row_count": len(rows), "sql": wrapped[:500]},
        )

        return json.dumps(
            {
                "sql": inner_sql,
                "sql_wrapped": wrapped,
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
            },
            indent=2,
        )
    except Exception as exc:
        return json.dumps({"error": f"{exc.__class__.__name__}: {exc}"})
    finally:
        engine.dispose()


@tool
def validate_sql_safety(sql: str) -> str:
    """Validate that a SQL query is a safe read-only SELECT/WITH statement.
    Returns JSON with 'valid' boolean and 'message' string."""
    is_valid, msg = validate_generated_sql(sql)
    return json.dumps({"valid": is_valid, "message": msg})


# ---------------------------------------------------------------------------
# Subagent definitions
# ---------------------------------------------------------------------------

SCHEMA_ANALYST_SYSTEM_PROMPT = """\
You are a schema analyst for an anomaly detection system. Your job is to deeply \
inspect a connected database and produce structured source intelligence.

Workflow:
1. Use `list_tables` to discover all tables and views.
2. Use `get_table_schema` on the most important tables (up to 10) to understand \
   columns, types, keys, and relationships.
3. Use `execute_readonly_sql` to run small exploratory queries (LIMIT 5) if you \
   need to understand data patterns, distributions, or quality.
4. Synthesize your findings into research notes with clear section headings.

Focus areas:
- Business entities and operational workflows represented by the data
- High-signal tables for procurement leakage, SLA risk, and resource optimization
- Columns that matter for joins, timestamps, rates, amounts, statuses, owners
- Likely join paths between operational tables
- Data quality risks: missing timestamps, ambiguous units, weak keys

Return concise but detailed research notes. Do NOT return JSON or structured output—\
just well-organized research notes with section headings.
"""

schema_analyst = {
    "name": "schema-analyst",
    "description": "Deeply inspects the connected database schema, explores tables and columns, "
    "and produces detailed research notes about business entities, join paths, "
    "and data quality risks. Use this for schema analysis tasks.",
    "system_prompt": SCHEMA_ANALYST_SYSTEM_PROMPT,
    "tools": [list_tables, get_table_schema, execute_readonly_sql],
}

PRESET_GENERATOR_SYSTEM_PROMPT = """\
You are an anomaly detection query designer. Your job is to design SQL-based \
detectors that catch financially meaningful and operationally useful anomalies.

You will receive schema research notes as input. Your workflow:
1. Read the research notes carefully.
2. Use `list_tables` and `get_table_schema` to verify specific table/column names \
   if the notes are ambiguous.
3. Use `validate_sql_safety` to verify every query you produce is a safe read-only \
   SELECT/WITH statement.
4. Use `execute_readonly_sql` (LIMIT 3) to sanity-check that your queries run and \
   return sensible data.
5. Return 4-6 detector presets as a JSON array with these fields per item:
   - name: Descriptive detector name
   - description: What anomaly it catches
   - category: One of "procurewatch", "sla_sentinel", "resource_optimization"
   - sql_text: A single read-only SELECT/WITH query
   - schedule_minutes: How often to run (15-1440)
   - expected_output_fields: Key output columns the dashboard will bind to
   - linked_action_template: Operational action when anomaly is found
   - linked_cost_formula: How financial impact is estimated

Design principles:
- Prefer explicit joins and business-meaningful thresholds
- Avoid vague detectors like simple row count spikes
- Every query must be executable against the real database
- Avoid write operations
"""

preset_generator = {
    "name": "preset-generator",
    "description": "Designs SQL anomaly detection queries from schema research notes. "
    "Produces 4-6 detector presets with categories, schedules, and action templates. "
    "Use this after schema analysis is complete.",
    "system_prompt": PRESET_GENERATOR_SYSTEM_PROMPT,
    "tools": [list_tables, get_table_schema, execute_readonly_sql, validate_sql_safety],
}

COPILOT_SYSTEM_PROMPT = """\
You are SLA.ck Copilot, an expert operations and finance SQL analyst. \
Your job is to answer user questions by writing and executing SQL against \
the connected source database.

Workflow:
1. Use `list_tables` to understand what's available.
2. Use `get_table_schema` on relevant tables.
3. Write a strong SQL query that directly answers the question.
4. Use `validate_sql_safety` to confirm the query is safe.
5. Use `execute_readonly_sql` (LIMIT 25) to run it.
6. Return your findings as clear, actionable analyst notes.

Guidelines:
- Prefer a single strong query over many weak ones.
- Use joins deliberately and choose business-meaningful measures.
- If the question is underspecified, make the narrowest reasonable assumption and say so.
- Do not invent facts not in the data.
- If the user asks for drivers, vendors, departments, contracts, invoices, alerts, \
  or SLA items, return identifiers and descriptive fields a human can follow up on.
- Return concise results—do NOT dump raw data. Summarize key findings.

Connected source memory:
Return your answer as structured notes (not JSON). The main agent will format \
the final response.
"""

copilot_analyst = {
    "name": "copilot-analyst",
    "description": "Answers user questions about the connected data by writing, validating, "
    "and executing SQL queries. Returns concise analyst findings with key data points. "
    "Use this for Q&A and investigation tasks.",
    "system_prompt": COPILOT_SYSTEM_PROMPT,
    "tools": [list_tables, get_table_schema, execute_readonly_sql, validate_sql_safety],
}

# ---------------------------------------------------------------------------
# Agent construction
# ---------------------------------------------------------------------------

MAIN_SYSTEM_PROMPT = """\
You are the SQL Agent, an orchestrator for database intelligence in an anomaly \
detection platform. You coordinate specialized subagents to analyze database \
schemas and design anomaly detection queries.

Available subagents:
- `schema-analyst`: Inspects the database schema deeply and produces research \
  notes about business entities, join paths, and data quality.
- `preset-generator`: Designs 4-6 SQL anomaly detection query presets from \
  schema research notes.
- `copilot-analyst`: Answers user questions by writing and executing SQL.

Workflow for artifact generation:
1. First, delegate schema analysis to `schema-analyst`.
2. Then delegate preset generation to `preset-generator` with the research notes.
3. Parse the preset JSON output and validate it.

Workflow for copilot Q&A:
1. Delegate the investigation to `copilot-analyst`.
2. Parse the answer and format it as a structured copilot response.

Always use subagents for complex multi-step work to keep your context clean.
"""


def _build_sql_agent():
    """Build the Deep Agent for SQL analysis."""
    from deepagents import create_deep_agent

    llm = _get_llm()
    llm_name = "gemini" if settings.gemini_api_key else "cerebras"
    logger.info("sql_agent_building model=%s", llm_name)

    # Inject memory into copilot system prompt at runtime via the invoke call
    agent = create_deep_agent(
        model=llm,
        tools=[list_tables, get_table_schema, execute_readonly_sql, validate_sql_safety],
        system_prompt=MAIN_SYSTEM_PROMPT,
        subagents=[schema_analyst, preset_generator, copilot_analyst],
        context_schema=SqlAgentContext,
        name="sql-agent",
    )
    return agent


# Cache the compiled agent (one per process)
_sql_agent = None


def _get_sql_agent():
    global _sql_agent
    if _sql_agent is None:
        _sql_agent = _build_sql_agent()
    return _sql_agent


# ---------------------------------------------------------------------------
# Task functions — thin wrappers that invoke the deep agent
# ---------------------------------------------------------------------------


def _generate_sql_artifacts_with_deep_agent(context: dict[str, Any]) -> dict[str, Any]:
    connector = context.get("connector", {})
    relations = context.get("relations", [])

    if not settings.gemini_api_key and not settings.cerebras_api_key:
        raise ValueError("GEMINI_API_KEY or CEREBRAS_API_KEY required")

    connector_id = int(connector.get("id") or 0)
    raw_uri = str(connector.get("uri") or "").strip()
    if not raw_uri:
        raise ValueError("Connector URI is required")
    uri = _resolve_connector_uri(raw_uri)
    connector_name = str(connector.get("name") or "")
    org_id = str(
        context.get("org_id")
        or context.get("organization_id")
        or connector.get("organization_id")
        or ""
    )
    relation_names = [r.get("qualified_name", "") for r in relations[:20]]

    logger.info("sql_agent_connecting connector_id=%s uri_prefix=%s", connector_id, uri[:30])

    _emit_artifact_event(
        connector_id,
        "schema_analysis",
        "Starting schema analysis via Deep Agent.",
        {"relation_count": len(relations)},
    )

    agent = _get_sql_agent()

    agent_context = {
        "connector_id": connector_id,
        "connector_uri": uri,
        "connector_name": connector_name,
        "org_id": org_id,
        "session_id": None,
        "relation_names": relation_names,
        "memory_summary": "",
        "memory_dashboard_brief": "",
        "memory_schema_notes": "",
    }

    # --- Phase 1: Schema analysis ---
    schema_result = agent.invoke(
        {
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "Use the `task` tool to delegate to the `schema-analyst` subagent. "
                        f"Analyze the database schema for the source named '{connector_name}'. "
                        f"Known relations from cache: {', '.join(relation_names[:20])}\n\n"
                        "Produce detailed research notes covering:\n"
                        "1. Key business entities and operational workflows\n"
                        "2. High-signal tables for procurement leakage, SLA risk, and resource optimization\n"
                        "3. Important columns for joins, timestamps, rates, amounts, statuses, owners\n"
                        "4. Likely join paths between operational tables\n"
                        "5. Data quality risks and monitoring caveats\n\n"
                        "Return well-organized research notes with section headings."
                    ),
                }
            ],
        },
        {"context": agent_context},
    )

    summary_research = _extract_last_message(schema_result)

    # Structure the research notes into SchemaSummaryResponse
    llm = _get_llm()
    try:
        summary_llm = llm.with_structured_output(SchemaSummaryResponse)
        structured_summary = summary_llm.invoke(
            f"Convert the following schema research notes into structured source intelligence.\n\n"
            f"Database name: {connector_name}\n\n"
            f"Research notes:\n{summary_research}",
        )
        summary_text = "\n\n".join(
            [
                structured_summary.business_summary,
                f"Operational scope: {structured_summary.operational_scope}",
                "Key tables:\n"
                + "\n".join(
                    f"- {item.qualified_name}: {item.purpose} | "
                    f"key columns: {', '.join(item.key_columns[:8]) or 'n/a'}"
                    for item in structured_summary.key_tables[:6]
                ),
                "Anomaly focus areas:\n"
                + "\n".join(f"- {item}" for item in structured_summary.anomaly_focus_areas[:8]),
                "Join paths:\n"
                + "\n".join(f"- {item}" for item in structured_summary.join_paths[:8]),
            ]
        ).strip()
        dashboard_brief = structured_summary.dashboard_brief
        schema_notes = "\n".join(structured_summary.schema_notes[:8]).strip()
    except Exception:
        logger.warning("sql_agent_summary_structured_output_failed connector_id=%s", connector_id)
        summary_text = summary_research
        dashboard_brief = "Dashboard showing anomaly detection results from generated presets."
        schema_notes = f"Generated by Deep Agent SQL Agent. Analyzed {len(relations)} tables."

    logger.info("sql_agent_schema_analyzed connector_id=%s", connector_id)

    # --- Phase 2: Preset generation ---
    _emit_artifact_event(
        connector_id,
        "preset_generation",
        "Generating anomaly detection query presets via Deep Agent.",
    )

    # Update context with memory for the preset phase
    agent_context["memory_summary"] = summary_text[:2500]
    agent_context["memory_dashboard_brief"] = dashboard_brief
    agent_context["memory_schema_notes"] = schema_notes

    preset_result = agent.invoke(
        {
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "Use the `task` tool to delegate to the `preset-generator` subagent. "
                        f"Design 4-6 anomaly detection query presets for the database "
                        f"'{connector_name}'.\n\n"
                        f"Schema intelligence:\n{summary_text[:3000]}\n\n"
                        f"Relation names: {', '.join(relation_names[:20])}\n\n"
                        "Requirements:\n"
                        "- Focus on financially meaningful and operationally useful anomalies\n"
                        "- Categories: procurewatch, sla_sentinel, resource_optimization\n"
                        "- Every sql_text must be a single read-only SELECT/WITH query\n"
                        "- Validate each query with validate_sql_safety before returning\n"
                        "- Test each query with execute_readonly_sql (LIMIT 3) to confirm it works\n"
                        "- expected_output_fields should name key columns for dashboard bindings\n"
                        "- schedule_minutes between 15 and 1440\n"
                        "- linked_action_template: operational, specific, references emitted fields\n"
                        "- linked_cost_formula: how financial impact is estimated\n\n"
                        "Return 4-6 presets as a JSON array."
                    ),
                }
            ],
        },
        {"context": agent_context},
    )

    preset_output = _extract_last_message(preset_result)

    # Parse presets from the agent output
    presets = _parse_presets_from_text(preset_output)

    logger.info(
        "sql_agent_presets_generated connector_id=%s count=%s",
        connector_id,
        len(presets),
    )

    return {
        "summary_text": summary_text[:4000] if summary_text else "",
        "dashboard_brief": dashboard_brief,
        "schema_notes": schema_notes
        or f"Generated by Deep Agent SQL Agent. Analyzed {len(relations)} tables.",
        "presets": presets[:6],
        "engine_name": f"deep-agent-{'gemini' if settings.gemini_api_key else 'cerebras'}",
    }


def _answer_question_with_deep_agent(context: dict[str, Any]) -> dict[str, Any]:
    connector = context.get("connector", {})
    question = str(context.get("question") or "").strip()
    session_id = context.get("session_id")
    memory = context.get("memory") or {}

    if not question:
        raise ValueError("Question required")

    connector_id = int(connector.get("id") or 0)
    raw_uri = str(connector.get("uri") or "").strip()
    if not raw_uri:
        raise ValueError("Connector URI is required")
    uri = _resolve_connector_uri(raw_uri)
    connector_name = str(connector.get("name") or "")
    org_id = str(
        context.get("org_id")
        or context.get("organization_id")
        or connector.get("organization_id")
        or ""
    )

    _emit_copilot_event(
        session_id,
        "Reviewing source memory and planning the investigation.",
        {"question": question},
    )

    agent_context = {
        "connector_id": connector_id,
        "connector_uri": uri,
        "connector_name": connector_name,
        "org_id": org_id,
        "session_id": session_id,
        "relation_names": [],
        "memory_summary": memory.get("summary_text", ""),
        "memory_dashboard_brief": memory.get("dashboard_brief", ""),
        "memory_schema_notes": memory.get("schema_notes", ""),
    }

    agent = _get_sql_agent()

    agent_result = agent.invoke(
        {
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "Use the `task` tool to delegate to the `copilot-analyst` subagent. "
                        f"Answer this question about the connected data source "
                        f"'{connector_name}':\n\n{question}\n\n"
                        f"Connected source memory:\n"
                        f"- Summary: {memory.get('summary_text', '')}\n"
                        f"- Dashboard brief: {memory.get('dashboard_brief', '')}\n"
                        f"- Schema notes: {memory.get('schema_notes', '')}\n\n"
                        "Instructions:\n"
                        "1. Inspect the schema as needed.\n"
                        "2. Identify the exact business slice, grain, and measures.\n"
                        "3. Write a strong SQL query and validate it.\n"
                        "4. Execute the query (LIMIT 25) and analyze results.\n"
                        "5. Provide a concise analyst answer grounded in the data.\n\n"
                        "Return structured analyst notes with:\n"
                        "- A short snake_case query label\n"
                        "- A one-line top-line conclusion\n"
                        "- A compact paragraph with findings and any assumptions made"
                    ),
                }
            ],
        },
        {"context": agent_context},
    )

    agent_notes = _extract_last_message(agent_result)

    tool_payload = _extract_last_tool_json(agent_result, tool_name="execute_readonly_sql")
    sql = str(tool_payload.get("sql") or "").strip() if tool_payload else ""
    rows = tool_payload.get("rows") if tool_payload else []
    if not isinstance(rows, list):
        rows = []

    # Try to extract any SQL that was executed from the copilot events
    # Parse the agent notes into a structured response
    llm = _get_llm()
    try:
        answer_llm = llm.with_structured_output(CopilotAnswerResponse)
        answer = answer_llm.invoke(
            f"Convert these analyst notes into a structured copilot response.\n\n"
            f"Question: {question}\n\n"
            f"Analyst notes:\n{agent_notes}",
        )
    except Exception:
        logger.warning("sql_agent_copilot_structured_output_failed connector_id=%s", connector_id)
        answer = CopilotAnswerResponse(
            query_label="copilot_query",
            summary=agent_notes[:200],
            explanation=agent_notes,
        )

    _emit_copilot_event(
        session_id,
        "Packaging final answer.",
        {"row_count": 0},
    )

    return {
        "query_label": answer.query_label,
        "sql": sql,
        "rows": rows,
        "explanation": answer.explanation,
        "summary": answer.summary,
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


def _extract_last_tool_json(result: Any, *, tool_name: str) -> dict[str, Any]:
    """Extract the last ToolMessage content for `tool_name` and parse it as JSON."""
    if not isinstance(result, dict):
        return {}
    messages = result.get("messages", [])
    for msg in reversed(messages):
        name = getattr(msg, "name", None) or (msg.get("name") if isinstance(msg, dict) else None)
        if name != tool_name:
            continue
        content = getattr(msg, "content", None) or (
            msg.get("content") if isinstance(msg, dict) else None
        )
        if not isinstance(content, str) or not content.strip():
            return {}
        try:
            parsed = json.loads(content)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _parse_presets_from_text(text: str) -> list[dict[str, Any]]:
    """Parse preset JSON array from agent output text."""
    import re

    # Try fenced JSON block first
    fenced_match = re.search(r"```(?:json)?\s*(\[[\s\S]*?\])\s*```", text, re.IGNORECASE)
    if fenced_match:
        try:
            raw = json.loads(fenced_match.group(1))
            if isinstance(raw, list):
                return _normalize_presets(raw)
        except (json.JSONDecodeError, TypeError):
            pass

    # Try bare JSON array
    json_match = re.search(r"\[[\s\S]*\]", text)
    if json_match:
        try:
            raw = json.loads(json_match.group())
            if isinstance(raw, list):
                return _normalize_presets(raw)
        except (json.JSONDecodeError, TypeError):
            pass

    return []


def _normalize_presets(raw_presets: list[Any]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in raw_presets:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        description = str(item.get("description", "")).strip()
        sql_text = str(item.get("sql_text", "")).strip()
        linked_action_template = str(item.get("linked_action_template", "")).strip()
        linked_cost_formula = str(item.get("linked_cost_formula", "")).strip()
        category = str(item.get("category", "")).strip()
        if not all((name, description, sql_text, linked_action_template, linked_cost_formula)):
            continue
        if category not in {"procurewatch", "sla_sentinel", "resource_optimization"}:
            continue
        expected_output_fields = [
            str(field).strip()
            for field in item.get("expected_output_fields", [])
            if str(field).strip()
        ]
        schedule_minutes = int(item.get("schedule_minutes") or 60)
        normalized.append(
            {
                "name": name,
                "description": description,
                "category": category,
                "sql_text": sql_text,
                "schedule_minutes": min(max(schedule_minutes, 15), 1440),
                "expected_output_fields": expected_output_fields,
                "linked_action_template": linked_action_template,
                "linked_cost_formula": linked_cost_formula,
            }
        )
    return normalized[:6]


# ---------------------------------------------------------------------------
# A2A endpoints
# ---------------------------------------------------------------------------


@app.get("/agent-card")
def agent_card() -> dict:
    return {
        "name": "business-sentry-sql-agent",
        "description": "Generates source summaries and SQL anomaly presets using Deep Agent with specialized subagents.",
        "endpoint": "/message/send",
        "skills": ["generate_sql_artifacts", "answer_question"],
    }


@app.post("/message/send")
def message_send(payload: A2ARequest) -> dict:
    task_type = payload.params.get("task_type")
    context = payload.params.get("payload", {})

    if task_type == "generate_sql_artifacts":
        logger.info("sql_agent_request connector_id=%s", context.get("connector", {}).get("id"))
        started = time.perf_counter()

        result = _generate_sql_artifacts_with_deep_agent(context)

        latency_ms = int((time.perf_counter() - started) * 1000)
        logger.info(
            "sql_agent_done connector_id=%s latency_ms=%s preset_count=%s",
            context.get("connector", {}).get("id"),
            latency_ms,
            len(result.get("presets", [])),
        )
        return {"jsonrpc": "2.0", "id": payload.id, "result": result}

    if task_type == "answer_question":
        logger.info(
            "sql_agent_copilot_request connector_id=%s", context.get("connector", {}).get("id")
        )
        started = time.perf_counter()
        result = _answer_question_with_deep_agent(context)
        latency_ms = int((time.perf_counter() - started) * 1000)
        logger.info(
            "sql_agent_copilot_done connector_id=%s latency_ms=%s",
            context.get("connector", {}).get("id"),
            latency_ms,
        )
        return {"jsonrpc": "2.0", "id": payload.id, "result": result}

    raise HTTPException(status_code=400, detail="Unsupported task type")
