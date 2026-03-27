import json
import logging
import time
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from langchain_core.callbacks.base import BaseCallbackHandler
from pydantic import BaseModel, Field

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

from app.core.config import settings
from app.services.artifact_event_client import emit_remote_artifact_event
from app.services.connector_crypto import decrypt_connector_uri
from app.utils.logging import get_logger

logger = get_logger("app.sql_agent")


class A2ARequest(BaseModel):
    jsonrpc: str = "2.0"
    id: str
    method: str
    params: dict


app = FastAPI(title="Business Sentry SQL Agent")


class SqlPreset(BaseModel):
    name: str = Field(min_length=1)
    description: str = Field(min_length=1)
    category: Literal["procurewatch", "sla_sentinel", "resource_optimization"]
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

    def on_agent_action(self, action, **kwargs: Any) -> Any:
        self._emit(
            stage="agent_action",
            message=f"Agent selected tool `{action.tool}`.",
            detail={"tool": action.tool, "tool_input": str(action.tool_input)[:240]},
        )

    def on_tool_start(self, serialized: dict[str, Any], input_str: str, **kwargs: Any) -> Any:
        tool_name = serialized.get("name", "tool")
        self._emit(
            stage="tool_start",
            message=f"Running tool `{tool_name}`.",
            detail={"tool": tool_name, "input_preview": input_str[:240]},
        )

    def on_tool_end(self, output: Any, **kwargs: Any) -> Any:
        self._emit(
            stage="tool_end",
            message="Tool finished.",
            detail={"output_preview": str(output)[:240]},
        )

    def on_agent_finish(self, finish, **kwargs: Any) -> Any:
        self._emit(
            stage="agent_finish",
            message="Agent finished current reasoning pass.",
            detail={"output_preview": str(finish.return_values)[:240]},
        )

    def on_llm_start(self, serialized: dict[str, Any], prompts: list[str], **kwargs: Any) -> Any:
        self._emit(
            stage="llm_start",
            message="Model structured output generation started.",
            detail={"prompt_preview": prompts[0][:240] if prompts else ""},
        )

    def on_llm_end(self, response, **kwargs: Any) -> Any:
        self._emit(stage="llm_end", message="Model structured output generation finished.")


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


def _generate_sql_artifacts_with_langchain(context: dict[str, Any]) -> dict[str, Any]:
    from langchain_community.agent_toolkits import SQLDatabaseToolkit
    from langchain_community.agent_toolkits import create_sql_agent
    from langchain_community.utilities import SQLDatabase

    connector = context.get("connector", {})
    relations = context.get("relations", [])

    if not settings.gemini_api_key and not settings.cerebras_api_key:
        raise ValueError("GEMINI_API_KEY or CEREBRAS_API_KEY required")

    def _resolve_connector_uri(raw_uri: str) -> str:
        normalized = raw_uri.strip()
        if normalized.startswith(("postgres://", "postgresql://", "postgresql+psycopg://")):
            return normalized
        return decrypt_connector_uri(normalized)

    def _stringify_agent_output(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        if isinstance(value, list):
            return "\n".join(_stringify_agent_output(item) for item in value if item is not None)
        if isinstance(value, dict):
            text = value.get("text")
            if isinstance(text, str):
                return text
            content = value.get("content")
            if content is not None:
                return _stringify_agent_output(content)
            return json.dumps(value)
        content = getattr(value, "content", None)
        if content is not None:
            return _stringify_agent_output(content)
        return str(value)

    def _parse_presets_from_output(value: Any) -> list[dict[str, Any]]:
        import re

        def _collect_text_fragments(node: Any) -> list[str]:
            if node is None:
                return []
            if isinstance(node, str):
                return [node]
            if isinstance(node, list):
                fragments: list[str] = []
                for item in node:
                    fragments.extend(_collect_text_fragments(item))
                return fragments
            if isinstance(node, dict):
                fragments: list[str] = []
                text = node.get("text")
                if isinstance(text, str):
                    fragments.append(text)
                content = node.get("content")
                if content is not None:
                    fragments.extend(_collect_text_fragments(content))
                return fragments
            content = getattr(node, "content", None)
            if content is not None:
                return _collect_text_fragments(content)
            return [str(node)]

        candidates: list[str] = []
        fragments = _collect_text_fragments(value)
        if fragments:
            candidates.extend(fragment.strip() for fragment in fragments if fragment and fragment.strip())
            joined = "\n".join(fragment for fragment in fragments if fragment and fragment.strip()).strip()
            if joined:
                candidates.append(joined)
        fallback_text = _stringify_agent_output(value).strip()
        if fallback_text:
            candidates.append(fallback_text)

        seen: set[str] = set()
        for text in candidates:
            if text in seen:
                continue
            seen.add(text)
            fenced_match = re.search(r"```(?:json)?\s*(\[[\s\S]*?\])\s*```", text, re.IGNORECASE)
            if fenced_match:
                return json.loads(fenced_match.group(1))

            json_match = re.search(r"\[[\s\S]*?\]", text)
            if json_match:
                try:
                    return json.loads(json_match.group())
                except json.JSONDecodeError:
                    pass

            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, list):
                return parsed

        raise json.JSONDecodeError("Unable to parse preset JSON", fallback_text or "", 0)

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

    # Get database connection
    try:
        uri = _resolve_connector_uri(connector.get("uri", ""))
        logger.info(
            "sql_agent_connecting connector_id=%s uri=%s", connector.get("id"), uri[:30] + "..."
        )

        db = SQLDatabase.from_uri(uri)
        logger.info("sql_agent_db_connected connector_id=%s", connector.get("id"))

        # Use Gemini if available, else Cerebras
        if settings.gemini_api_key:
            llm = _build_gemini_llm()
            logger.info("sql_agent_using_llm connector_id=%s model=gemini", connector.get("id"))
        else:
            llm = _build_llm()
            logger.info("sql_agent_using_llm connector_id=%s model=cerebras", connector.get("id"))

        # Create SQL agent with tools
        trace_handler = AgentTraceCallbackHandler(int(connector.get("id") or 0), "sql_agent")
        toolkit = SQLDatabaseToolkit(db=db, llm=llm)
        agent = create_sql_agent(
            llm=llm,
            toolkit=toolkit,
            agent_type="tool-calling",
            verbose=True,
            max_iterations=10,
            agent_executor_kwargs={"callbacks": [trace_handler]},
        )

        # Task 1: Analyze schema and generate summary
        logger.info("sql_agent_analyzing_schema connector_id=%s", connector.get("id"))
        emit_remote_artifact_event(
            int(connector.get("id") or 0),
            kind="trace",
            stage="schema_analysis",
            agent="sql_agent",
            status="running",
            message="Analyzing database schema and relation coverage.",
            detail={"relation_count": len(relations)},
        )
        summary_research_response = agent.invoke(
            {
                "input": f"""You are performing source-intelligence research for an anomaly detection system.

Your job is to inspect the database schema deeply and write research notes, not final JSON.

Database name: {connector.get("name")}
Known relations from cache: {", ".join([r.get("qualified_name") for r in relations[:20]])}

Instructions:
1. List the most important business entities and what operational workflow they represent.
2. Identify the highest-signal tables/views for procurement leakage, SLA risk, and resource optimization.
3. Call out the columns that matter for joins, timestamps, rates, units, amounts, statuses, owners, SLA windows, and risk scoring.
4. Note likely join paths between operational tables.
5. Highlight data quality risks, missing timestamps, ambiguous units, or weak keys that could affect anomaly detection.
6. Be specific. Name concrete tables and columns wherever possible.

Return concise but detailed research notes with clear section headings."""
            }
        )
        summary_research = _stringify_agent_output(summary_research_response.get("output", ""))
        try:
            summary_llm = llm.with_structured_output(SchemaSummaryResponse)
            structured_summary = summary_llm.invoke(
                f"""Convert the following schema research notes into structured source intelligence.

Database name: {connector.get("name")}
Research notes:
{summary_research}

Requirements:
- business_summary should explain what the system does and what decisions it supports.
- operational_scope should describe the main operating workflows and actors.
- key_tables should focus on the most important monitoring tables only.
- anomaly_focus_areas should be concrete and detector-oriented.
- join_paths should mention real table relationships in plain English.
- dashboard_brief should be short and useful for designing an operations dashboard.
- schema_notes should mention caveats, blind spots, and monitoring considerations.
""",
                config={"callbacks": [trace_handler]},
            )
            summary_text = "\n\n".join(
                [
                    structured_summary.business_summary,
                    f"Operational scope: {structured_summary.operational_scope}",
                    "Key tables:\n"
                    + "\n".join(
                        f"- {item.qualified_name}: {item.purpose} | key columns: {', '.join(item.key_columns[:8]) or 'n/a'}"
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
            logger.warning("sql_agent_summary_structured_output_failed connector_id=%s", connector.get("id"))
            structured_summary = None
            summary_text = summary_research
            dashboard_brief = "Dashboard showing anomaly detection results from generated presets."
            schema_notes = f"Generated by LangChain SQL Agent. Analyzed {len(relations)} tables."
        logger.info("sql_agent_schema_analyzed connector_id=%s", connector.get("id"))

        # Task 2: Generate anomaly detection queries
        logger.info("sql_agent_generating_presets connector_id=%s", connector.get("id"))
        emit_remote_artifact_event(
            int(connector.get("id") or 0),
            kind="trace",
            stage="preset_generation",
            agent="sql_agent",
            status="running",
            message="Generating anomaly detection query presets.",
        )
        preset_research_response = agent.invoke(
            {
                "input": f"""You are designing anomaly detectors for this database.

First inspect the schema and produce detailed detector-design notes. Do not return final JSON yet.

Database name: {connector.get("name")}
Summary context:
{summary_text[:2500]}

Instructions:
1. Identify the best candidate tables and joins for financially meaningful anomalies.
2. For each of these categories, propose concrete detection angles:
   - procurewatch
   - sla_sentinel
   - resource_optimization
3. For each angle, note the exact columns, filters, thresholds, and timestamp fields that make the query operationally useful.
4. Prefer detector ideas with strong business actionability, not generic row counts.
5. Avoid write operations and avoid vague output fields.
6. Mention the likely output columns each detector should emit.

Return detector-design notes with sections for candidate joins, measures, thresholds, timestamps, and actionability."""
            }
        )
        preset_research = _stringify_agent_output(preset_research_response.get("output", ""))
        try:
            structured_llm = llm.with_structured_output(SqlPresetBatch)
            preset_batch = structured_llm.invoke(
                f"""Generate 4-6 SQL anomaly detection queries for this database.

Use this context:
- Database name: {connector.get("name")}
- Source intelligence:
{summary_text[:3000]}
- Relation names: {", ".join([r.get("qualified_name") for r in relations[:20]])}
- Detector design notes:
{preset_research[:4000]}

Requirements:
- Focus on financially meaningful and operationally useful anomalies.
- Categories must be one of: procurewatch, sla_sentinel, resource_optimization.
- Every sql_text must be a single read-only SELECT/WITH query.
- expected_output_fields should name the key columns the dashboard and detector runner will rely on.
- schedule_minutes must be between 15 and 1440.
- linked_action_template should be operational, specific, and reference emitted fields.
- linked_cost_formula should describe how impact is estimated from the query output.
- Prefer explicit joins, business thresholds, and ordering that helps human review.
- Avoid vague detectors like simple row count spikes unless they tie directly to business impact.
""",
                config={"callbacks": [trace_handler]},
            )
            presets = [item.model_dump() for item in preset_batch.presets][:6]
            logger.info("sql_agent_presets_generated connector_id=%s", connector.get("id"))
        except Exception:
            logger.warning(
                "sql_agent_structured_output_failed connector_id=%s",
                connector.get("id"),
            )
            presets_response = agent.invoke(
                {
                    "input": f"""Generate 4-6 SQL anomaly detection queries for this database.
For each query, provide:
- name: Descriptive name
- description: What it detects
- category: procurewatch, sla_sentinel, or resource_optimization
- sql_text: The SELECT query (no INSERT/UPDATE/DELETE)
- schedule_minutes: How often to run (15-1440)
- expected_output_fields: List of key output columns
- linked_action_template: What to do when anomalies found
- linked_cost_formula: How to calculate financial impact

Return as JSON array with these fields for each preset."""
                }
            )
            presets_output = presets_response.get("output", "")
            presets_result = _stringify_agent_output(presets_output)
            logger.info("sql_agent_presets_generated connector_id=%s", connector.get("id"))
            try:
                presets = _normalize_presets(_parse_presets_from_output(presets_output))
            except (json.JSONDecodeError, AttributeError, TypeError, ValueError):
                logger.warning(
                    "sql_agent_preset_parse_failed connector_id=%s preview=%s",
                    connector.get("id"),
                    presets_result[:500],
                )
                presets = []

        return {
            "summary_text": summary_text[:4000] if summary_text else "",
            "dashboard_brief": dashboard_brief,
            "schema_notes": schema_notes or f"Generated by LangChain SQL Agent. Analyzed {len(relations)} tables.",
            "presets": presets[:6],
            "engine_name": f"langchain-{'gemini' if settings.gemini_api_key else 'cerebras'}",
        }

    except Exception as exc:
        logger.exception("sql_agent_error connector_id=%s error=%s", connector.get("id"), str(exc))
        raise


@app.get("/agent-card")
def agent_card() -> dict:
    return {
        "name": "business-sentry-sql-agent",
        "description": "Generates source summaries and SQL anomaly presets using LangChain SQL Agent.",
        "endpoint": "/message/send",
        "skills": ["generate_sql_artifacts"],
    }


@app.post("/message/send")
def message_send(payload: A2ARequest) -> dict:
    task_type = payload.params.get("task_type")
    context = payload.params.get("payload", {})

    if task_type != "generate_sql_artifacts":
        raise HTTPException(status_code=400, detail="Unsupported task type")

    logger.info("sql_agent_request connector_id=%s", context.get("connector", {}).get("id"))
    started = time.perf_counter()

    result = _generate_sql_artifacts_with_langchain(context)

    latency_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "sql_agent_done connector_id=%s latency_ms=%s preset_count=%s",
        context.get("connector", {}).get("id"),
        latency_ms,
        len(result.get("presets", [])),
    )

    return {"jsonrpc": "2.0", "id": payload.id, "result": result}
