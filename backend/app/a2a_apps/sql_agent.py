from fastapi import FastAPI
from pydantic import BaseModel

from app.services.agent_artifacts import _fallback_sql_agent_payload


class A2ARequest(BaseModel):
    jsonrpc: str = "2.0"
    id: str
    method: str
    params: dict


app = FastAPI(title="Business Sentry SQL Agent")


@app.get("/agent-card")
def agent_card() -> dict:
    return {
        "name": "business-sentry-sql-agent",
        "description": "Generates source summaries and SQL anomaly presets from connector context.",
        "endpoint": "/message/send",
        "skills": ["generate_sql_artifacts"],
    }


@app.post("/message/send")
def message_send(payload: A2ARequest) -> dict:
    task_type = payload.params.get("task_type")
    context = payload.params.get("payload", {})
    if task_type != "generate_sql_artifacts":
        return {"jsonrpc": "2.0", "id": payload.id, "error": {"message": "Unsupported task type"}}
    return {"jsonrpc": "2.0", "id": payload.id, "result": _fallback_sql_agent_payload(context)}
