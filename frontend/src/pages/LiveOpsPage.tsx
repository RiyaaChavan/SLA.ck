import { useState } from "react";
import type { LiveWorkItem } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { formatMoneyInr, formatDateTime } from "../lib/formatters";
import { useLiveOps } from "../hooks/useBusinessSentry";
import { NavLink } from "react-router-dom";

type LiveOpsPageProps = {
  organizationId?: number;
};

const STAGES = ["monitoring", "escalation", "resolved"];

const RISK_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function riskRank(risk: string): number {
  return RISK_ORDER[risk.toLowerCase()] ?? 0;
}

function breachBadgeClass(risk: string): string {
  const x = risk.toLowerCase();
  if (x === "critical" || x === "high") return "badge-critical";
  if (x === "medium") return "badge-medium";
  if (x === "low") return "badge-low";
  return "badge-default";
}

export function LiveOpsPage({ organizationId }: LiveOpsPageProps) {
  const q = useLiveOps(organizationId);
  const [localStages, setLocalStages] = useState<Record<string, string>>({});

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Select a workspace" description="Choose an organization in the sidebar." />
      </div>
    );
  }

  if (q.isPending) {
    return (
      <div className="page-content">
        <StateBlock title="Loading live ops" loading />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="page-content">
        <StateBlock title="Could not load live ops" />
      </div>
    );
  }

  const rows = [...q.data].sort((a, b) => {
    const risk = riskRank(b.predicted_breach_risk) - riskRank(a.predicted_breach_risk);
    if (risk !== 0) return risk;
    const t = (a.time_remaining_minutes ?? 99999) - (b.time_remaining_minutes ?? 99999);
    if (t !== 0) return t;
    return b.projected_penalty - a.projected_penalty;
  });

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    setLocalStages((prev) => ({ ...prev, [id]: stage }));
  };

  const getStage = (r: LiveWorkItem) => localStages[r.id] || r.current_stage || "monitoring";

  const columns = STAGES.map((stage) => ({
    stage,
    items: rows.filter((r) => getStage(r) === stage),
  }));

  const otherStages = Array.from(new Set(rows.map(getStage))).filter((s) => !STAGES.includes(s));
  otherStages.forEach((stage) => {
    columns.push({
      stage,
      items: rows.filter((r) => getStage(r) === stage),
    });
  });

  return (
    <div className="page-content bs-kanban-layout">
      <PageHeader
        title="Live Case Monitor"
        subtitle="Prioritized queue of active work items. Drag and drop to update stages."
      />

      <div className="bs-kanban-board">
        {columns.map((col) => (
          <div
            key={col.stage}
            className="bs-kanban-column"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.stage)}
          >
            <div className="bs-kanban-column-header">
              <h3 className="bs-kanban-column-title">{col.stage.replace("_", " ")}</h3>
              <span className="bs-kanban-count">{col.items.length}</span>
            </div>
            <div className="bs-kanban-cards">
              {col.items.map((r) => (
                <div
                  key={r.id}
                  className="bs-kanban-card"
                  draggable
                  onDragStart={(e) => handleDragStart(e, r.id)}
                >
                  <div className="bs-kanban-card-header">
                    <span className="bs-kanban-card-id">{r.id}</span>
                    <span className={`badge ${breachBadgeClass(r.predicted_breach_risk)}`}>
                      {r.predicted_breach_risk}
                    </span>
                  </div>
                  <div className="bs-kanban-card-title">{r.title}</div>
                  {r.workflow_category ? (
                    <div className="td-sub" style={{ fontSize: 11, marginBottom: 8 }}>
                      {r.workflow_category}
                    </div>
                  ) : null}
                  <div className="bs-kanban-card-meta">
                    <div className="bs-kanban-meta-item">
                      <span className="bs-muted">Team</span>
                      <strong>{r.team ?? "—"}</strong>
                    </div>
                    <div className="bs-kanban-meta-item">
                      <span className="bs-muted">SLA</span>
                      <strong>{r.assigned_sla_name ?? "—"}</strong>
                    </div>
                    <div className="bs-kanban-meta-item">
                      <span className="bs-muted">Time left</span>
                      <strong className={r.time_remaining_minutes < 60 ? "text-danger" : ""}>
                        {r.time_remaining_minutes}m
                      </strong>
                    </div>
                    <div className="bs-kanban-meta-item">
                      <span className="bs-muted">Penalty</span>
                      <strong>{formatMoneyInr(r.projected_penalty)}</strong>
                    </div>
                    {r.projected_business_impact > 0 ? (
                      <div className="bs-kanban-meta-item">
                        <span className="bs-muted">Biz impact</span>
                        <strong>{formatMoneyInr(r.projected_business_impact)}</strong>
                      </div>
                    ) : null}
                  </div>
                  {r.response_deadline || r.resolution_deadline ? (
                    <div className="td-sub" style={{ fontSize: 11, marginTop: 8 }}>
                      {r.response_deadline ? <>Response {formatDateTime(r.response_deadline)} · </> : null}
                      {r.resolution_deadline ? <>Res. {formatDateTime(r.resolution_deadline)}</> : null}
                    </div>
                  ) : null}
                  {r.match_rationale.length > 0 ? (
                    <ul className="td-sub" style={{ fontSize: 11, margin: "8px 0 0", paddingLeft: 16 }}>
                      {r.match_rationale.slice(0, 3).map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  {r.suggested_action ? (
                    <div className="bs-kanban-card-action">
                      <span className="bs-muted">Suggested:</span> {r.suggested_action}
                    </div>
                  ) : null}
                  {r.linked_case_id ? (
                    <div className="bs-kanban-card-footer">
                      <NavLink
                        to={`/cases?case=${encodeURIComponent(r.linked_case_id)}`}
                        className="btn btn-secondary btn-sm"
                        style={{ width: "100%" }}
                      >
                        View Case
                      </NavLink>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
