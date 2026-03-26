import { useState } from "react";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { formatMoneyInr, formatDateTime } from "../lib/formatters";
import { useLiveOps } from "../hooks/useBusinessSentry";
import { NavLink } from "react-router-dom";

type LiveOpsPageProps = {
  organizationId?: number;
};

const STAGES = ["monitoring", "escalation", "resolved"];

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
    const risk = b.predicted_breach_risk - a.predicted_breach_risk;
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
    setLocalStages(prev => ({ ...prev, [id]: stage }));
  };

  const getStage = (r: any) => localStages[r.id] || r.current_stage || "monitoring";

  // Group by stage
  const columns = STAGES.map(stage => ({
    stage,
    items: rows.filter(r => getStage(r) === stage)
  }));

  // If there are stages from backend not in STAGES, add them
  const otherStages = Array.from(new Set(rows.map(getStage))).filter(s => !STAGES.includes(s));
  otherStages.forEach(stage => {
    columns.push({
      stage,
      items: rows.filter(r => getStage(r) === stage)
    });
  });

  return (
    <div className="page-content bs-kanban-layout">
      <PageHeader
        title="Live Case Monitor"
        subtitle="Prioritized queue of active work items. Drag and drop to update stages."
      />

      <div className="bs-kanban-board">
        {columns.map(col => (
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
              {col.items.map(r => (
                <div 
                  key={r.id} 
                  className="bs-kanban-card"
                  draggable
                  onDragStart={(e) => handleDragStart(e, r.id)}
                >
                  <div className="bs-kanban-card-header">
                    <span className="bs-kanban-card-id">{r.id}</span>
                    <span className={`badge badge-${r.predicted_breach_risk > 0.5 ? 'critical' : 'default'}`}>
                      {r.predicted_breach_risk > 0.5 ? 'High Risk' : 'Normal'}
                    </span>
                  </div>
                  <div className="bs-kanban-card-title">{r.title}</div>
                  <div className="bs-kanban-card-meta">
                    <div className="bs-kanban-meta-item">
                      <span className="bs-muted">SLA</span>
                      <strong>{r.assigned_sla_name || "—"}</strong>
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
                  </div>
                  {r.suggested_action && (
                    <div className="bs-kanban-card-action">
                      <span className="bs-muted">Suggested:</span> {r.suggested_action}
                    </div>
                  )}
                  {r.linked_case_id && (
                    <div className="bs-kanban-card-footer">
                      <NavLink to={`/cases?case=${encodeURIComponent(r.linked_case_id)}`} className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
                        View Case
                      </NavLink>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
