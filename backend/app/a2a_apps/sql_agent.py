import json
import logging
import time
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

from app.core.config import settings
from app.services.connector_crypto import decrypt_connector_uri
from app.utils.logging import get_logger

logger = get_logger("app.sql_agent")


class A2ARequest(BaseModel):
    jsonrpc: str = "2.0"
    id: str
    method: str
    params: dict


app = FastAPI(title="Business Sentry SQL Agent")


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
        toolkit = SQLDatabaseToolkit(db=db, llm=llm)
        agent = create_sql_agent(
            llm=llm,
            toolkit=toolkit,
            agent_type="tool-calling",
            verbose=True,
            max_iterations=10,
        )

        # Task 1: Analyze schema and generate summary
        logger.info("sql_agent_analyzing_schema connector_id=%s", connector.get("id"))
        schema_analysis_response = agent.invoke(
            {
                "input": f"""Analyze this database schema and provide:
1. A 2-3 sentence business summary of what data this database contains
2. Key tables and their purposes
3. Important columns for anomaly detection

Database name: {connector.get("name")}
Tables: {", ".join([r.get("qualified_name") for r in relations[:10]])}"""
            }
        )
        schema_analysis = schema_analysis_response.get("output", "")
        logger.info("sql_agent_schema_analyzed connector_id=%s", connector.get("id"))

        # Task 2: Generate anomaly detection queries
        logger.info("sql_agent_generating_presets connector_id=%s", connector.get("id"))
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
        presets_result = presets_response.get("output", "")
        logger.info("sql_agent_presets_generated connector_id=%s", connector.get("id"))

        # Parse presets from agent output
        try:
            # Try to extract JSON from the output
            import re

            json_match = re.search(r"\[[\s\S]*\]", presets_result)
            if json_match:
                presets = json.loads(json_match.group())
            else:
                presets = json.loads(presets_result)
        except (json.JSONDecodeError, AttributeError):
            logger.warning("sql_agent_preset_parse_failed connector_id=%s", connector.get("id"))
            presets = []

        return {
            "summary_text": schema_analysis[:500] if schema_analysis else "",
            "dashboard_brief": "Dashboard showing anomaly detection results from generated presets.",
            "schema_notes": f"Generated by LangChain SQL Agent. Analyzed {len(relations)} tables.",
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
