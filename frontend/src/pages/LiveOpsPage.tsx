import { useCallback, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { LiveWorkItem, AgenticIntakeResult } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { useNotifications } from "../components/shared/Notifications";
import { formatDateTime, formatMoneyInr } from "../lib/formatters";
import {
  useCreateApprovalIntake,
  useCreateTicketIntake,
  useLiveOps,
} from "../hooks/useBusinessSentry";

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

/* ── Add Ticket Drawer (AI Assisted) ───────────────────────── */
function AddTicketDrawer({
  onClose,
  onAdd,
  organizationId,
}: {
  onClose: () => void;
  onAdd: (item: AgenticIntakeResult) => void;
  organizationId: number;
}) {
  const [phase, setPhase] = useState<AddTicketPhase>("form");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [aiResult, setAiResult] = useState<AgenticIntakeResult | null>(null);

  const ticketMut = useCreateTicketIntake(organizationId);
  const { notify } = useNotifications();

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setPhase("processing");
    
    ticketMut.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        status: "open",
        region: "default",
      },
      {
        onSuccess: (data) => {
          // Add a small delay to simulate "AI thinking" even if API is fast, for UX consistency with UI branch
          setTimeout(() => {
            setAiResult(data);
            setPhase("result");
          }, 1500);
        },
        onError: () => {
          setPhase("form");
          notify({
            tone: "error",
            title: "Analysis failed",
            message: "Could not create the ticket from the provided details.",
          });
        },
      }
    );
  };

  const handleConfirm = () => {
    if (!aiResult) return;
    onAdd(aiResult);
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
                disabled={!title.trim() || ticketMut.isPending}
                onClick={handleSubmit}
              >
                {ticketMut.isPending ? "Analyzing..." : "✦ Analyze with AI"}
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
          {phase === "result" && aiResult && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div
                style={{
                  padding: "12px 14px",
                  background: "rgba(36,119,208,0.07)",
                  border: "1px solid rgba(36,119,208,0.2)",
                  borderRadius: 10,
                }}
              >
                <div className="ai-result-label" style={{ marginBottom: 4 }}>Intake Result</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{aiResult.live_item.title}</div>
                <div className="td-sub" style={{ marginTop: 4, fontSize: 12 }}>
                  Classification: {aiResult.classification.workflow_category} · {aiResult.classification.priority} priority
                </div>
              </div>

              <div className="ai-result-field">
                <div className="ai-result-label">✦ AI-Generated Signals</div>
                <div className="ai-tags-row">
                  {aiResult.classification.detected_sla_signals.slice(0, 4).map((tag) => (
                    <span key={tag} className="ai-tag">{tag}</span>
                  ))}
                  {aiResult.classification.risk_flags.slice(0, 2).map((tag) => (
                    <span key={tag} className="ai-tag border-rose-500/30 text-rose-400">{tag}</span>
                  ))}
                </div>
              </div>

              <div className="ai-result-field">
                <div className="ai-result-label">Predicted Breach Risk</div>
                <span className={`badge ${riskBadge(aiResult.live_item.predicted_breach_risk)}`} style={{ fontSize: 12.5, padding: "4px 12px" }}>
                  {aiResult.live_item.predicted_breach_risk}
                </span>
              </div>

              <div className="ai-result-field">
                <div className="ai-result-label">Projected Penalty Exposure</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.025em" }}>
                  {formatMoneyInr(aiResult.live_item.projected_penalty)}
                </div>
              </div>

              <div className="ai-result-field">
                <div className="ai-result-label">SLA Connected</div>
                <span className="badge badge-blue" style={{ fontSize: 12, padding: "4px 10px" }}>
                  {aiResult.live_item.assigned_sla_name ?? "General Policy"}
                </span>
              </div>

              <div className="ai-result-field">
                <div className="ai-result-label">Time Remaining</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#FBB424" }}>
                  {aiResult.live_item.time_remaining_minutes}m
                </div>
                <div className="td-sub" style={{ marginTop: 2 }}>Before SLA breach window closes</div>
              </div>

              <div className="ai-result-field">
                <div className="ai-result-label">Suggested Action</div>
                <div style={{ fontSize: 13.5, color: "var(--text-1)", padding: "12px 14px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)", lineHeight: 1.55 }}>
                  {aiResult.live_item.suggested_action}
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "100%", padding: "13px 0", fontSize: 14, fontWeight: 600, marginTop: 4 }}
                onClick={handleConfirm}
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
  onClick,
}: {
  row: LiveWorkItem;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`bs-kanban-card-compact ${riskClass(row.predicted_breach_risk)}`}
      draggable
      onDragStart={(e) => onDragStart(e, row.id)}
      onClick={onClick}
    >
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

      <div className="bs-kanban-card-title">{row.title}</div>

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
                {row.response_deadline ? `Res. ${formatDateTime(row.response_deadline)} · ` : ""}
                {row.resolution_deadline ? `Reso. ${formatDateTime(row.resolution_deadline)}` : ""}
              </span>
            </div>
          )}
        </div>
      )}

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
export function LiveOpsPage({ organizationId }: LiveOpsPageProps) {
  const { notify } = useNotifications();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useLiveOps(organizationId);

  const [localStages, setLocalStages] = useState<Record<string, string>>({});
  const [prepended, setPrepended] = useState<LiveWorkItem[]>([]);
  const [showAddTicket, setShowAddTicket] = useState(false);
  const [drawerItem, setDrawerItem] = useState<LiveWorkItem | null>(null);

  const mergedData = useMemo(() => {
    if (!q.data) return prepended;
    const apiIds = new Set(q.data.map((x) => x.id));
    const prefix = prepended.filter((p) => !apiIds.has(p.id));
    return [...prefix, ...q.data];
  }, [q.data, prepended]);

  const rows = useMemo(() => {
    return [...mergedData].sort((a, b) => {
      const risk = riskRank(b.predicted_breach_risk) - riskRank(a.predicted_breach_risk);
      if (risk !== 0) return risk;
      const t = (a.time_remaining_minutes ?? 99999) - (b.time_remaining_minutes ?? 99999);
      if (t !== 0) return t;
      return b.projected_penalty - a.projected_penalty;
    });
  }, [mergedData]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    setLocalStages((prev) => ({ ...prev, [id]: stage }));
  };

  const getStage = (row: LiveWorkItem) => localStages[row.id] || row.current_stage || "monitoring";

  const columns = STAGES.map((stage) => ({
    stage,
    items: rows.filter((row) => getStage(row) === stage),
  }));

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Create a workspace" description="Choose a workspace to view the operation queue." />
      </div>
    );
  }

  return (
    <div className="page-content bs-kanban-layout bs-live-ops">
      <PageHeader
        title="Live Case Monitor"
        subtitle="Prioritized operating queue from the SLA runtime. Create AI-assisted tickets below."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowAddTicket(true)}>
            + New Ticket
          </button>
        }
      />

      {q.isPending && !prepended.length ? (
        <StateBlock title="Loading queue" loading />
      ) : (
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
                    <div className="bs-kanban-empty-zone">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--text-3)", opacity: 0.5 }}>
                        <circle cx="12" cy="12" r="10" />
                        <path d="M8 12h8M12 8v8" />
                      </svg>
                      <span style={{ fontSize: 11, color: "var(--text-3)", opacity: 0.7 }}>Drag cards here</span>
                    </div>
                  ) : (
                    column.items.map((row) => (
                      <CompactCard 
                        key={row.id} 
                        row={row} 
                        onDragStart={handleDragStart} 
                        onClick={() => setDrawerItem(row)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddTicket && (
        <AddTicketDrawer
          organizationId={organizationId}
          onClose={() => setShowAddTicket(false)}
          onAdd={(data) => {
            setPrepended((prev) => [data.live_item, ...prev]);
            notify({
              tone: data.alert_id ? "warning" : "success",
              title: "Ticket monitoring active",
              message: `AI has prioritized #${data.live_item.id} with ${data.live_item.predicted_breach_risk} risk level.`,
            });
            if (data.recommendation_id) {
              void qc.invalidateQueries({ queryKey: ["bs", "actions", organizationId] });
            }
          }}
        />
      )}

      {drawerItem && (
        <div
          className="bs-drawer-backdrop"
          role="presentation"
          onClick={() => setDrawerItem(null)}
        >
          <div
            className="bs-drawer-panel card"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header bs-drawer-header">
              <div>
                <div className="card-title">{drawerItem.title}</div>
                <div className="card-subtitle td-sub">#{drawerItem.id} · {drawerItem.item_type}</div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDrawerItem(null)}>Close</button>
            </div>
            <div className="card-body bs-drawer-body">
              <section className="bs-drawer-section">
                <h4 className="bs-drawer-section-title">SLA &amp; Performance</h4>
                <dl className="bs-drawer-dl">
                  <dt>Owner</dt><dd>{drawerItem.owner_name}</dd>
                  <dt>SLA Name</dt><dd>{drawerItem.assigned_sla_name ?? "—"}</dd>
                  <dt>Risk Level</dt><dd className={breachBadgeClass(drawerItem.predicted_breach_risk)}>{drawerItem.predicted_breach_risk}</dd>
                  <dt>Penalty Exposure</dt><dd>{formatMoneyInr(drawerItem.projected_penalty)}</dd>
                </dl>
              </section>

              {drawerItem.match_rationale.length > 0 && (
                <section className="bs-drawer-section">
                  <h4 className="bs-drawer-section-title">AI Rationale</h4>
                  <ul className="td-sub bs-drawer-list">
                    {drawerItem.match_rationale.map((line, i) => <li key={i}>{line}</li>)}
                  </ul>
                </section>
              )}

              {drawerItem.suggested_action && (
                <section className="bs-drawer-section">
                  <h4 className="bs-drawer-section-title">Suggested Next Step</h4>
                  <div className="bs-drawer-action-callout">{drawerItem.suggested_action}</div>
                </section>
              )}

              {drawerItem.linked_case_id && (
                <button 
                  type="button" 
                  className="btn btn-primary w-full mt-4"
                  onClick={() => {
                    navigate(`/cases?case=${encodeURIComponent(drawerItem.linked_case_id!)}`);
                    setDrawerItem(null);
                  }}
                >
                  Deep dive into Case
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function breachBadgeClass(risk: string): string {
  const x = risk.toLowerCase();
  if (x === "critical" || x === "high") return "text-rose-400 font-bold";
  if (x === "medium") return "text-amber-400 font-bold";
  return "text-sky-400";
}
