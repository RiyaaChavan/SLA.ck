import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import type { LiveWorkItem } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { demoLiveOps } from "../demo/businessSentryHardcoded";
import { formatDateTime, formatMoneyInr } from "../lib/formatters";

type LiveOpsPageProps = {
  organizationId?: number;
};

const STAGES = ["monitoring", "escalation", "resolved"];
const RISK_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function riskRank(risk: string) {
  return RISK_ORDER[risk.toLowerCase()] ?? 0;
}

function breachBadgeClass(risk: string) {
  const x = risk.toLowerCase();
  if (x === "critical" || x === "high") return "badge-critical";
  if (x === "medium") return "badge-medium";
  if (x === "low") return "badge-low";
  return "badge-default";
}

export function LiveOpsPage(_: LiveOpsPageProps) {
  const [localStages, setLocalStages] = useState<Record<string, string>>({});
  const [rows, setRows] = useState(demoLiveOps);

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const risk = riskRank(b.predicted_breach_risk) - riskRank(a.predicted_breach_risk);
        if (risk !== 0) return risk;
        const t = (a.time_remaining_minutes ?? 99999) - (b.time_remaining_minutes ?? 99999);
        if (t !== 0) return t;
        return b.projected_penalty - a.projected_penalty;
      }),
    [rows],
  );

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
    if (stage === "resolved") {
      setRows((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: "resolved", current_stage: "resolved", time_remaining_minutes: 0 } : item,
        ),
      );
    }
  };

  const getStage = (row: LiveWorkItem) => localStages[row.id] || row.current_stage || "monitoring";

  const columns = STAGES.map((stage) => ({
    stage,
    items: sortedRows.filter((row) => getStage(row) === stage),
  }));

  return (
    <div className="page-content bs-kanban-layout">
      <PageHeader
        title="Live Case Monitor"
        subtitle="Prioritized operating queue from the SLA runtime. Drag cards across stages to simulate workflow movement."
      />

      <div className="bs-kanban-board">
        {columns.map((column) => (
          <div
            key={column.stage}
            className="bs-kanban-column"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.stage)}
          >
            <div className="bs-kanban-column-header">
              <h3 className="bs-kanban-column-title">{column.stage.replace("_", " ")}</h3>
              <span className="bs-kanban-count">{column.items.length}</span>
            </div>
            <div className="bs-kanban-cards">
              {column.items.map((row) => (
                <div
                  key={row.id}
                  className="bs-kanban-card"
                  draggable
                  onDragStart={(e) => handleDragStart(e, row.id)}
                >
                  <div className="bs-kanban-card-header">
                    <span className="bs-kanban-card-id">{row.id}</span>
                    <span className={`badge ${breachBadgeClass(row.predicted_breach_risk)}`}>
                      {row.predicted_breach_risk}
                    </span>
                  </div>
                  <div className="bs-kanban-card-title">{row.title}</div>
                  {row.workflow_category ? (
                    <div className="td-sub" style={{ fontSize: 11, marginBottom: 8 }}>
                      {row.workflow_category}
                    </div>
                  ) : null}
                  <div className="bs-kanban-card-meta">
                    <div className="bs-kanban-meta-item">
                      <span className="bs-muted">Team</span>
                      <strong>{row.team ?? "—"}</strong>
                    </div>
                    <div className="bs-kanban-meta-item">
                      <span className="bs-muted">Owner</span>
                      <strong>{row.owner_name}</strong>
                    </div>
                    <div className="bs-kanban-meta-item">
                      <span className="bs-muted">SLA</span>
                      <strong>{row.assigned_sla_name ?? "—"}</strong>
                    </div>
                    <div className="bs-kanban-meta-item">
                      <span className="bs-muted">Time left</span>
                      <strong className={row.time_remaining_minutes < 60 ? "text-danger" : ""}>
                        {row.time_remaining_minutes}m
                      </strong>
                    </div>
                    <div className="bs-kanban-meta-item">
                      <span className="bs-muted">Penalty</span>
                      <strong>{formatMoneyInr(row.projected_penalty)}</strong>
                    </div>
                    {row.projected_business_impact > 0 ? (
                      <div className="bs-kanban-meta-item">
                        <span className="bs-muted">Biz impact</span>
                        <strong>{formatMoneyInr(row.projected_business_impact)}</strong>
                      </div>
                    ) : null}
                  </div>
                  {row.response_deadline || row.resolution_deadline ? (
                    <div className="td-sub" style={{ fontSize: 11, marginTop: 8 }}>
                      {row.response_deadline ? <>Response {formatDateTime(row.response_deadline)} · </> : null}
                      {row.resolution_deadline ? <>Res. {formatDateTime(row.resolution_deadline)}</> : null}
                    </div>
                  ) : null}
                  {row.match_rationale.length ? (
                    <ul className="td-sub" style={{ fontSize: 11, margin: "8px 0 0", paddingLeft: 16 }}>
                      {row.match_rationale.slice(0, 3).map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="bs-kanban-card-action">
                    <span className="bs-muted">Suggested:</span> {row.suggested_action}
                  </div>
                  {row.linked_case_id ? (
                    <div className="bs-kanban-card-footer">
                      <NavLink
                        to={`/cases?case=${encodeURIComponent(row.linked_case_id)}`}
                        className="btn btn-secondary btn-sm"
                        style={{ width: "100%" }}
                      >
                        View case
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
