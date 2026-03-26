from fastapi import FastAPI
from pydantic import BaseModel

from app.services.agent_artifacts import _fallback_dashboard_payload


class A2ARequest(BaseModel):
    jsonrpc: str = "2.0"
    id: str
    method: str
    params: dict


app = FastAPI(title="Business Sentry Dashboard Agent")


@app.get("/agent-card")
def agent_card() -> dict:
    return {
        "name": "business-sentry-dashboard-agent",
        "description": "Generates dashboard specs from connector context and detector results.",
        "endpoint": "/message/send",
        "skills": ["generate_dashboard_spec"],
    }


@app.post("/message/send")
def message_send(payload: A2ARequest) -> dict:
    task_type = payload.params.get("task_type")
    context = payload.params.get("payload", {})
    if task_type != "generate_dashboard_spec":
        return {"jsonrpc": "2.0", "id": payload.id, "error": {"message": "Unsupported task type"}}
    return {"jsonrpc": "2.0", "id": payload.id, "result": _fallback_dashboard_payload(context)}
