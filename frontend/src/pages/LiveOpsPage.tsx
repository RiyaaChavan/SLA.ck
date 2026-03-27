import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import type { LiveWorkItem } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { demoLiveOps } from "../demo/businessSentryHardcoded";
import { formatDateTime, formatMoneyInr } from "../lib/formatters";

type LiveOpsPageProps = { organizationId?: number };
type AddTicketPhase = "form" | "processing" | "result";

const STAGES = ["monitoring", "escalation", "resolved"];
const RISK_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function riskRank(risk: string) {
  return RISK_ORDER[risk.toLowerCase()] ?? 0;
}
function riskClass(risk: string) {
  const x = risk.toLowerCase();
  if (x === "critical") return "risk-critical";
  if (x === "high") return "risk-high";
  if (x === "medium") return "risk-medium";
  return "risk-low";
}
function riskBadge(risk: string) {
  const x = risk.toLowerCase();
  if (x === "critical") return "badge-critical";
  if (x === "high") return "badge-high";
  if (x === "medium") return "badge-medium";
  return "badge-low";
}

/* ── AI ticket generation ───────────────────────────────────── */
const AI_TAGS_POOL = [
  ["late-delivery", "dispatch-saturation", "sla-breach-risk", "ai-detected"],
  ["contract-drift", "vendor-billing", "module:procurement", "recurring"],
  ["cold-chain-breach", "reefer-downtime", "high-penalty", "auto-flagged"],
];
const AI_SLAS = ["SLA-LM-01 · Response 2h", "SLA-AP-02 · Response 4h", "SLA-CC-03 · Response 1h"];
const AI_ACTIONS = [
  "Rebalance riders and cap slot density at affected stores",
  "Hold disputed invoices and request vendor credit note within SLA window",
  "Escalate reefer downtime — reroute chilled orders to nearest cold hub",
];

function buildAiWorkItem(title: string): Partial<LiveWorkItem> & { ai_tags: string[] } {
  const idx = Math.abs(title.length) % 3;
  return {
    title,
    predicted_breach_risk: "high",
    current_stage: "monitoring",
    status: "open",
    workflow_category: "Manual Submission",
    team: "Operations Team",
    owner_name: "You",
    assigned_sla_name: AI_SLAS[idx].split(" · ")[0],
    time_remaining_minutes: 210,
    projected_penalty: 95000 + idx * 60000,
    projected_business_impact: 0,
    match_rationale: [AI_ACTIONS[idx]],
    suggested_action: AI_ACTIONS[idx],
    linked_case_id: null,
    response_deadline: null,
    resolution_deadline: null,
    ai_tags: AI_TAGS_POOL[idx],
  } as unknown as Partial<LiveWorkItem> & { ai_tags: string[] };
}

/* ── Add Ticket Drawer ─────────────────────────────────────── */
function AddTicketDrawer({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (item: LiveWorkItem) => void;
}) {
  const [phase, setPhase] = useState<AddTicketPhase>("form");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [aiData, setAiData] = useState<ReturnType<typeof buildAiWorkItem> | null>(null);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setPhase("processing");
    await new Promise((r) => setTimeout(r, 2800));
    setAiData(buildAiWorkItem(title));
    setPhase("result");
  };

  const handleAdd = () => {
    if (!aiData) return;
    const newItem: LiveWorkItem = {
      id: `TKT-AI-${Date.now()}`,
      ...aiData,
    } as unknown as LiveWorkItem;
    onAdd(newItem);
    onClose();
  };

  return (
    <div
      className="bs-drawer-backdrop"
      role="presentation"
      onClick={phase === "processing" ? undefined : onClose}
    >
      <aside
        className="bs-drawer bs-drawer-narrow"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ display: "flex", flexDirection: "column" }}
      >
        <div className="bs-drawer-header" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
            <span className="new-ticket-header-badge">✦ AI-Assisted</span>
            {phase !== "processing" && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                Close
              </button>
            )}
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>New Ticket</h2>
        </div>

        <div className="bs-drawer-body" style={{ flex: 1, overflowY: "auto" }}>
          {/* FORM */}
          {phase === "form" && (
            <div className="new-ticket-form">
              <p className="td-sub" style={{ lineHeight: 1.6 }}>
                Describe the issue — AI will assess risk, estimate penalty exposure, and link the right SLA.
              </p>
              <label className="bs-field">
                <span>Title</span>
                <input
                  className="bs-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Late delivery spike at BLR-HSR stores"
                  autoFocus
                  style={{ fontSize: 14 }}
                />
              </label>
              <label className="bs-field">
                <span>Description</span>
                <textarea
                  className="bs-textarea"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What did you observe? Which stores, vendors, or time window?"
                  style={{ minHeight: 120, fontSize: 13.5, lineHeight: 1.6 }}
                />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "100%", padding: "12px 0", fontSize: 14, fontWeight: 600 }}
                disabled={!title.trim()}
                onClick={handleSubmit}
              >
                ✦ Analyze with AI
              </button>
            </div>
          )}

          {/* PROCESSING */}
          {phase === "processing" && (
            <div className="ai-processing-state">
              <div className="ai-spinner-wrap">
                <div className="ai-spinner-ring" />
                <div className="ai-spinner-inner" />
              </div>
              <div className="ai-processing-label">AI is analyzing your ticket…</div>
              <div className="ai-processing-sub">
                Assessing breach risk, matching SLA rules, estimating penalty exposure
              </div>
              <div className="ai-skeleton-block" style={{ width: "100%" }}>
                <div className="ai-skeleton" style={{ width: "80%" }} />
                <div className="ai-skeleton" style={{ width: "60%" }} />
                <div className="ai-skeleton" style={{ width: "88%" }} />
                <div className="ai-skeleton" style={{ width: "50%" }} />
                <div className="ai-skeleton" style={{ width: "70%" }} />
              </div>
            </div>
          )}

          {/* RESULT */}
          {phase === "result" && aiData && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div
                style={{
                  padding: "12px 14px",
                  background: "rgba(36,119,208,0.07)",
                  border: "1px solid rgba(36,119,208,0.2)",
                  borderRadius: 10,
                }}
              >
                <div className="ai-result-label" style={{ marginBottom: 4 }}>Ticket</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{title}</div>
                {description && (
                  <div className="td-sub" style={{ marginTop: 4, fontSize: 12 }}>
                    {description.slice(0, 90)}{description.length > 90 ? "…" : ""}
                  </div>
                )}
              </div>

              <div className="ai-result-field">
                <div className="ai-result-label">✦ AI-Generated Tags</div>
                <div className="ai-tags-row">
                  {aiData.ai_tags.map((tag) => (
                    <span key={tag} className="ai-tag">{tag}</span>
                  ))}
                </div>
              </div>

              <div className="ai-result-field">
                <div className="ai-result-label">Predicted Breach Risk</div>
                <span className={`badge badge-${aiData.predicted_breach_risk}`} style={{ fontSize: 12.5, padding: "4px 12px" }}>
                  {String(aiData.predicted_breach_risk).charAt(0).toUpperCase() + String(aiData.predicted_breach_risk).slice(1)}
                </span>
              </div>

              <div className="ai-result-field">
                <div className="ai-result-label">Projected Penalty Exposure</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.025em" }}>
                  {formatMoneyInr(aiData.projected_penalty ?? 0)}
                </div>
              </div>

              <div className="ai-result-field">
                <div className="ai-result-label">SLA Connected</div>
                <span className="badge badge-blue" style={{ fontSize: 12, padding: "4px 10px" }}>
                  {aiData.assigned_sla_name}
                </span>
              </div>

              <div className="ai-result-field">
                <div className="ai-result-label">Time Remaining</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#FBB424" }}>
                  {aiData.time_remaining_minutes}m
                </div>
                <div className="td-sub" style={{ marginTop: 2 }}>Before SLA breach window closes</div>
              </div>

              <div className="ai-result-field">
                <div className="ai-result-label">Suggested Action</div>
                <div style={{ fontSize: 13.5, color: "var(--text-1)", padding: "12px 14px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)", lineHeight: 1.55 }}>
                  {aiData.suggested_action}
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "100%", padding: "13px 0", fontSize: 14, fontWeight: 600, marginTop: 4 }}
                onClick={handleAdd}
              >
                Add to Monitoring Queue
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ── Compact Kanban Card ───────────────────────────────────── */
function CompactCard({
  row,
  onDragStart,
}: {
  row: LiveWorkItem;
  onDragStart: (e: React.DragEvent, id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`bs-kanban-card-compact ${riskClass(row.predicted_breach_risk)}`}
      draggable
      onDragStart={(e) => onDragStart(e, row.id)}
    >
      {/* Top row: ID + risk badge + expand toggle */}
      <div className="bs-kanban-card-top">
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
          {row.id}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className={`badge ${riskBadge(row.predicted_breach_risk)}`} style={{ fontSize: 10.5 }}>
            {row.predicted_breach_risk}
          </span>
          {row.time_remaining_minutes < 60 && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#F87171", fontFamily: "var(--font-mono)" }}>
              {row.time_remaining_minutes}m
            </span>
          )}
          <button
            type="button"
            className="bs-kanban-expand-btn"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            title={expanded ? "Collapse" : "Expand"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "transform 200ms", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="bs-kanban-card-title">{row.title}</div>

      {/* Expanded details */}
      {expanded && (
        <div className="bs-kanban-expanded-meta">
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
            <strong style={{ color: row.time_remaining_minutes < 60 ? "#F87171" : "var(--text-1)" }}>
              {row.time_remaining_minutes}m
            </strong>
          </div>
          <div className="bs-kanban-meta-item">
            <span className="bs-muted">Penalty</span>
            <strong>{formatMoneyInr(row.projected_penalty)}</strong>
          </div>
          {row.projected_business_impact > 0 && (
            <div className="bs-kanban-meta-item">
              <span className="bs-muted">Biz impact</span>
              <strong>{formatMoneyInr(row.projected_business_impact)}</strong>
            </div>
          )}
          {(row.response_deadline || row.resolution_deadline) && (
            <div className="bs-kanban-meta-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
              <span className="bs-muted" style={{ marginBottom: 2 }}>Deadlines</span>
              <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>
                {row.response_deadline ? `Response ${formatDateTime(row.response_deadline)} · ` : ""}
                {row.resolution_deadline ? `Resolve ${formatDateTime(row.resolution_deadline)}` : ""}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Bottom: suggested action + optional link */}
      <div className="bs-kanban-card-bottom">
        <div className="bs-kanban-card-action-compact">
          <span className="bs-muted">Suggested: </span>{row.suggested_action}
        </div>
        {expanded && row.linked_case_id && (
          <NavLink
            to={`/cases?case=${encodeURIComponent(row.linked_case_id)}`}
            className="btn btn-secondary btn-sm"
            style={{ width: "100%", marginTop: 10, textAlign: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            View Case →
          </NavLink>
        )}
      </div>
    </div>
  );
}

const COLUMN_META: Record<string, { label: string; dotClass: string; colClass: string }> = {
  monitoring: { label: "Monitoring", dotClass: "bs-kanban-col-dot-monitoring", colClass: "bs-kanban-column-monitoring" },
  escalation: { label: "Escalation", dotClass: "bs-kanban-col-dot-escalation", colClass: "bs-kanban-column-escalation" },
  resolved: { label: "Resolved", dotClass: "bs-kanban-col-dot-resolved", colClass: "bs-kanban-column-resolved" },
};

/* ── Main Page ─────────────────────────────────────────────── */
export function LiveOpsPage(_: LiveOpsPageProps) {
  const [localStages, setLocalStages] = useState<Record<string, string>>({});
  const [rows, setRows] = useState(demoLiveOps);
  const [showAddTicket, setShowAddTicket] = useState(false);

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
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
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
    <div className="page-content bs-kanban-layout bs-live-ops">
      <PageHeader
        title="Live Case Monitor"
        subtitle="Prioritized operating queue from the SLA runtime. Drag cards across stages to simulate workflow movement."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowAddTicket(true)}>
            + New Ticket
          </button>
        }
      />

      <div className="bs-kanban-board">
        {columns.map((column) => {
          const meta = COLUMN_META[column.stage] ?? { label: column.stage, dotClass: "", colClass: "" };
          return (
            <div
              key={column.stage}
              className={`bs-kanban-column ${meta.colClass}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.stage)}
            >
              <div className="bs-kanban-column-header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`bs-kanban-col-dot ${meta.dotClass}`} />
                  <h3 className="bs-kanban-column-title">{meta.label}</h3>
                </div>
                <span className="bs-kanban-count">{column.items.length}</span>
              </div>
              <div className="bs-kanban-cards">
                {column.items.length === 0 ? (
                  <div
                    style={{
                      flex: 1, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      gap: 8, padding: "32px 16px",
                      border: "1px dashed rgba(255,255,255,0.06)",
                      borderRadius: 8, margin: "4px",
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--text-3)", opacity: 0.5 }}>
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 12h8M12 8v8" />
                    </svg>
                    <span style={{ fontSize: 12, color: "var(--text-3)", opacity: 0.7, textAlign: "center" }}>Drag cards here</span>
                  </div>
                ) : (
                  column.items.map((row) => (
                    <CompactCard key={row.id} row={row} onDragStart={handleDragStart} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showAddTicket && (
        <AddTicketDrawer
          onClose={() => setShowAddTicket(false)}
          onAdd={(item) => {
            setRows((prev) => [item, ...prev]);
            setShowAddTicket(false);
          }}
        />
      )}
    </div>
  );
}
