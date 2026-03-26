import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import type { AgenticClassification, LiveWorkItem } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { useNotifications } from "../components/shared/Notifications";
import { formatMoneyInr, formatDateTime } from "../lib/formatters";
import {
  useCreateApprovalIntake,
  useCreateTicketIntake,
  useLiveOps,
} from "../hooks/useBusinessSentry";
import { NavLink, useNavigate } from "react-router-dom";

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

const COLUMN_META: Record<string, { label: string; dotClass: string; colClass: string }> = {
  monitoring: { label: "Monitoring", dotClass: "bs-kanban-col-dot-monitoring", colClass: "bs-kanban-column-monitoring" },
  escalation: { label: "Escalation", dotClass: "bs-kanban-col-dot-escalation", colClass: "bs-kanban-column-escalation" },
  resolved: { label: "Resolved", dotClass: "bs-kanban-col-dot-resolved", colClass: "bs-kanban-column-resolved" },
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

function classificationForDrawer(r: LiveWorkItem): AgenticClassification | null {
  return r.intakeContext?.classification ?? null;
}

export function LiveOpsPage({ organizationId }: LiveOpsPageProps) {
  const { notify } = useNotifications();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useLiveOps(organizationId);
  const ticketMut = useCreateTicketIntake(organizationId);
  const approvalMut = useCreateApprovalIntake(organizationId);

  const [localStages, setLocalStages] = useState<Record<string, string>>({});
  const [prepended, setPrepended] = useState<LiveWorkItem[]>([]);
  const [drawerItem, setDrawerItem] = useState<LiveWorkItem | null>(null);
  const [intakeBanner, setIntakeBanner] = useState<{
    alert?: boolean;
    recommendationId?: number;
  } | null>(null);

  const [ticketForm, setTicketForm] = useState({
    title: "",
    description: "",
    department_name: "",
    vendor_name: "",
    backlog_hours: "",
    status: "open",
    region: "default",
  });
  const [approvalForm, setApprovalForm] = useState({
    title: "",
    description: "",
    requested_action_type: "open_review_task",
    department_name: "",
    vendor_name: "",
    backlog_hours: "",
    status: "open",
    region: "default",
  });

  const mergedData = useMemo(() => {
    if (!q.data) return null;
    const apiIds = new Set(q.data.map((x) => x.id));
    const prefix = prepended.filter((p) => !apiIds.has(p.id));
    return [...prefix, ...q.data];
  }, [q.data, prepended]);

  const rows = useMemo(() => {
    if (!mergedData) return [];
    return [...mergedData].sort((a, b) => {
      const risk = riskRank(b.predicted_breach_risk) - riskRank(a.predicted_breach_risk);
      if (risk !== 0) return risk;
      const t = (a.time_remaining_minutes ?? 99999) - (b.time_remaining_minutes ?? 99999);
      if (t !== 0) return t;
      return b.projected_penalty - a.projected_penalty;
    });
  }, [mergedData]);

  const railStats = useMemo(() => {
    const byRisk = { critical: 0, high: 0, medium: 0, low: 0, other: 0 };
    let impactAtRisk = 0;
    for (const r of rows) {
      const k = r.predicted_breach_risk.toLowerCase();
      if (k === "critical" || k === "high" || k === "medium" || k === "low") {
        byRisk[k] += 1;
      } else {
        byRisk.other += 1;
      }
      if (k === "critical" || k === "high") {
        impactAtRisk += r.projected_business_impact || r.projected_penalty;
      }
    }
    const breachedOrHot = rows.filter(
      (r) => (r.time_remaining_minutes ?? 0) < 0 || r.predicted_breach_risk.toLowerCase() === "critical",
    ).length;
    return { byRisk, impactAtRisk, total: rows.length, breachedOrHot };
  }, [rows]);

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

  const columns = useMemo(() => {
    const stageOf = (r: LiveWorkItem) => localStages[r.id] || r.current_stage || "monitoring";
    const base = STAGES.map((stage) => ({
      stage,
      items: rows.filter((r) => stageOf(r) === stage),
    }));
    const otherStages = Array.from(new Set(rows.map(stageOf))).filter((s) => !STAGES.includes(s));
    for (const stage of otherStages) {
      base.push({
        stage,
        items: rows.filter((r) => stageOf(r) === stage),
      });
    }
    return base;
  }, [rows, localStages]);

  const applyIntakeSuccess = useCallback(
    (
      live_item: LiveWorkItem,
      alert_id: number | null,
      recommendation_id: number | null,
      options?: { openApprovals?: boolean },
    ) => {
      setPrepended((prev) => [live_item, ...prev.filter((p) => p.id !== live_item.id)]);
      setDrawerItem(live_item);
      setIntakeBanner({
        alert: Boolean(alert_id),
        recommendationId: recommendation_id ?? undefined,
      });
      if (recommendation_id != null && organizationId != null) {
        void qc.invalidateQueries({ queryKey: ["bs", "actions", organizationId] });
        if (options?.openApprovals) {
          navigate(`/actions?intakeRec=${recommendation_id}`);
        }
      }
    },
    [navigate, qc, organizationId],
  );

  const onSubmitTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    ticketMut.mutate(
      {
        title: ticketForm.title.trim(),
        description: ticketForm.description.trim(),
        department_name: ticketForm.department_name.trim() || null,
        vendor_name: ticketForm.vendor_name.trim() || null,
        backlog_hours: ticketForm.backlog_hours.trim() ? Number(ticketForm.backlog_hours) : null,
        status: ticketForm.status,
        region: ticketForm.region,
      },
      {
        onSuccess: (data) => {
          notify({
            tone: data.alert_id ? "warning" : "success",
            title: "Ticket created",
            message: data.alert_id
              ? "The ticket was created and flagged for SLA monitoring."
              : "The ticket was created and added to the live queue.",
          });
          applyIntakeSuccess(data.live_item, data.alert_id, data.recommendation_id, {
            openApprovals: true,
          });
        },
        onError: () => {
          notify({
            tone: "error",
            title: "Ticket creation failed",
            message: "Could not create the ticket from the provided title and description.",
          });
        },
      },
    );
  };

  const onSubmitApproval = (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    approvalMut.mutate(
      {
        title: approvalForm.title.trim(),
        description: approvalForm.description.trim(),
        requested_action_type: approvalForm.requested_action_type.trim() || "open_review_task",
        department_name: approvalForm.department_name.trim() || null,
        vendor_name: approvalForm.vendor_name.trim() || null,
        backlog_hours: approvalForm.backlog_hours.trim() ? Number(approvalForm.backlog_hours) : null,
        status: approvalForm.status,
        region: approvalForm.region,
      },
      {
        onSuccess: (data) => {
          notify({
            tone: data.alert_id ? "warning" : "success",
            title: "Approval created",
            message: data.alert_id
              ? "The approval was created and marked as elevated SLA risk."
              : "The approval was created and routed into the live queue.",
          });
          applyIntakeSuccess(data.live_item, data.alert_id, data.recommendation_id);
        },
        onError: () => {
          notify({
            tone: "error",
            title: "Approval creation failed",
            message: "Could not create the approval request from the provided details.",
          });
        },
      },
    );
  };

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

  if (q.isError || !mergedData) {
    return (
      <div className="page-content">
        <StateBlock title="Could not load live ops" />
      </div>
    );
  }

  const cls = drawerItem ? classificationForDrawer(drawerItem) : null;
  const preview = drawerItem?.intakeContext?.approval_preview ?? null;

  return (
    <div className="page-content bs-kanban-layout">
      <PageHeader
        title="Live Case Monitor"
        subtitle="Prioritized queue of active work items. Create tickets or approvals; drag cards to update stages locally."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => {
            const el = document.querySelector('.bs-liveops-intake-grid');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}>
            + New Ticket
          </button>
        }
      />

      {intakeBanner ? (
        <div className="bs-liveops-banner-wrap">
          {intakeBanner.alert ? (
            <div className="bs-liveops-banner bs-liveops-banner-warn" role="status">
              SLA alert created — this intake is at elevated risk. Monitor deadlines below.
            </div>
          ) : null}
          {intakeBanner.recommendationId != null ? (
            <div className="bs-liveops-banner bs-liveops-banner-info" role="status">
              Recommendation #{intakeBanner.recommendationId} recorded.{" "}
              <NavLink
                to={`/actions?intakeRec=${intakeBanner.recommendationId}`}
                className="bs-liveops-banner-link"
              >
                Open approvals
              </NavLink>
            </div>
          ) : null}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIntakeBanner(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="bs-liveops-intake-grid">
        <form className="card bs-intake-card" onSubmit={onSubmitTicket}>
          <div className="card-header">
            <div className="card-title">Create ticket</div>
            <div className="card-subtitle td-sub">POST intake → board updates immediately</div>
          </div>
          <div className="card-body bs-intake-fields">
            <label className="bs-intake-label">
              Title
              <input
                className="bs-input"
                value={ticketForm.title}
                onChange={(e) => setTicketForm((p) => ({ ...p, title: e.target.value }))}
                required
              />
            </label>
            <label className="bs-intake-label">
              Description
              <textarea
                className="bs-input bs-textarea"
                rows={3}
                value={ticketForm.description}
                onChange={(e) => setTicketForm((p) => ({ ...p, description: e.target.value }))}
                required
              />
            </label>
            <div className="td-sub">Include urgency, blockers, approval gates, or SLA cues like "respond in 1 hour" and the agent will infer them.</div>
            <div className="bs-intake-row">
              <label className="bs-intake-label">
                Department (optional)
                <input
                  className="bs-input"
                  value={ticketForm.department_name}
                  onChange={(e) => setTicketForm((p) => ({ ...p, department_name: e.target.value }))}
                />
              </label>
              <label className="bs-intake-label">
                Vendor (optional)
                <input
                  className="bs-input"
                  value={ticketForm.vendor_name}
                  onChange={(e) => setTicketForm((p) => ({ ...p, vendor_name: e.target.value }))}
                />
              </label>
            </div>
            <div className="bs-intake-row">
              <label className="bs-intake-label">
                Backlog hours
                <input
                  className="bs-input"
                  type="number"
                  placeholder="auto"
                  value={ticketForm.backlog_hours}
                  onChange={(e) => setTicketForm((p) => ({ ...p, backlog_hours: e.target.value }))}
                />
              </label>
              <label className="bs-intake-label">
                Status
                <input
                  className="bs-input"
                  value={ticketForm.status}
                  onChange={(e) => setTicketForm((p) => ({ ...p, status: e.target.value }))}
                />
              </label>
              <label className="bs-intake-label">
                Region
                <input
                  className="bs-input"
                  value={ticketForm.region}
                  onChange={(e) => setTicketForm((p) => ({ ...p, region: e.target.value }))}
                />
              </label>
            </div>
          </div>
          <div className="card-footer">
            <button type="submit" className="btn btn-primary btn-sm" disabled={ticketMut.isPending}>
              {ticketMut.isPending ? "Creating…" : "Create ticket"}
            </button>
            {ticketMut.isError ? <span className="td-sub text-danger">Request failed</span> : null}
          </div>
        </form>

        <form className="card bs-intake-card" onSubmit={onSubmitApproval}>
          <div className="card-header">
            <div className="card-title">Create approval</div>
            <div className="card-subtitle td-sub">Same payload as ticket plus requested action type</div>
          </div>
          <div className="card-body bs-intake-fields">
            <label className="bs-intake-label">
              Title
              <input
                className="bs-input"
                value={approvalForm.title}
                onChange={(e) => setApprovalForm((p) => ({ ...p, title: e.target.value }))}
                required
              />
            </label>
            <label className="bs-intake-label">
              Description
              <textarea
                className="bs-input bs-textarea"
                rows={3}
                value={approvalForm.description}
                onChange={(e) => setApprovalForm((p) => ({ ...p, description: e.target.value }))}
                required
              />
            </label>
            <div className="td-sub">Describe approvals, deadlines, launch impact, or vendor context. Estimated value is inferred automatically.</div>
            <label className="bs-intake-label">
              Requested action type
              <input
                className="bs-input"
                value={approvalForm.requested_action_type}
                onChange={(e) => setApprovalForm((p) => ({ ...p, requested_action_type: e.target.value }))}
              />
            </label>
            <div className="bs-intake-row">
              <label className="bs-intake-label">
                Department (optional)
                <input
                  className="bs-input"
                  value={approvalForm.department_name}
                  onChange={(e) => setApprovalForm((p) => ({ ...p, department_name: e.target.value }))}
                />
              </label>
              <label className="bs-intake-label">
                Vendor (optional)
                <input
                  className="bs-input"
                  value={approvalForm.vendor_name}
                  onChange={(e) => setApprovalForm((p) => ({ ...p, vendor_name: e.target.value }))}
                />
              </label>
            </div>
            <div className="bs-intake-row">
              <label className="bs-intake-label">
                Backlog hours
                <input
                  className="bs-input"
                  type="number"
                  placeholder="auto"
                  value={approvalForm.backlog_hours}
                  onChange={(e) => setApprovalForm((p) => ({ ...p, backlog_hours: e.target.value }))}
                />
              </label>
            </div>
          </div>
          <div className="card-footer">
            <button type="submit" className="btn btn-primary btn-sm" disabled={approvalMut.isPending}>
              {approvalMut.isPending ? "Creating…" : "Create approval"}
            </button>
            {approvalMut.isError ? <span className="td-sub text-danger">Request failed</span> : null}
          </div>
        </form>
      </div>

      <div className="bs-liveops-shell">
        <div
          className="bs-kanban-board"
          style={{ ["--bs-kanban-cols" as string]: String(columns.length) }}
        >
          {columns.map((col) => {
            const meta = COLUMN_META[col.stage] ?? { label: col.stage.replace("_", " "), dotClass: "", colClass: "" };
            return (
            <div
              key={col.stage}
              className={`bs-kanban-column ${meta.colClass}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.stage)}
            >
              <div className="bs-kanban-column-header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {meta.dotClass ? <span className={`bs-kanban-col-dot ${meta.dotClass}`} /> : null}
                  <h3 className="bs-kanban-column-title">{meta.label}</h3>
                </div>
                <span className="bs-kanban-count">{col.items.length}</span>
              </div>
              <div className="bs-kanban-cards">
                {col.items.length === 0 ? (
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
                ) : null}
                {col.items.map((r) => (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    className="bs-kanban-card"
                    draggable
                    onDragStart={(e) => handleDragStart(e, r.id)}
                    onClick={() => setDrawerItem(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDrawerItem(r);
                      }
                    }}
                  >
                    <div className="bs-kanban-card-header">
                      <span className="bs-kanban-card-id">{r.id}</span>
                    </div>
                    <div className="bs-kanban-badges">
                      {r.assigned_sla_name ? (
                        <span className="bs-kanban-badge bs-kanban-badge-sla" title="Assigned SLA">
                          {r.assigned_sla_name}
                        </span>
                      ) : null}
                      <span className={`bs-kanban-badge bs-kanban-badge-risk ${breachBadgeClass(r.predicted_breach_risk)}`}>
                        {r.predicted_breach_risk}
                      </span>
                      <span className="bs-kanban-badge bs-kanban-badge-time" title="Time remaining (minutes)">
                        {r.time_remaining_minutes}m left
                      </span>
                      {r.workflow_category ? (
                        <span className="bs-kanban-badge bs-kanban-badge-cat">{r.workflow_category}</span>
                      ) : null}
                    </div>
                    <div className="bs-kanban-card-title">{r.title}</div>
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
                      <div className="bs-kanban-deadlines td-sub">
                        {r.response_deadline ? <>Response {formatDateTime(r.response_deadline)} · </> : null}
                        {r.resolution_deadline ? <>Res. {formatDateTime(r.resolution_deadline)}</> : null}
                      </div>
                    ) : null}
                    {r.suggested_action ? (
                      <div className="bs-kanban-card-action">
                        <span className="bs-muted">Suggested:</span> {r.suggested_action}
                      </div>
                    ) : null}
                    {r.match_rationale.length > 0 ? (
                      <ul className="td-sub bs-kanban-rationale">
                        {r.match_rationale.slice(0, 3).map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    {r.linked_case_id ? (
                      <div className="bs-kanban-card-footer">
                        <NavLink
                          to={`/cases?case=${encodeURIComponent(r.linked_case_id)}`}
                          className="btn btn-secondary btn-sm"
                          style={{ width: "100%" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Case
                        </NavLink>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            );
          })}
        </div>

        <aside className="bs-liveops-rail" aria-label="Queue summary">
          <div className="bs-liveops-rail-inner">
            <h3 className="bs-liveops-rail-title">Queue pulse</h3>
            <p className="td-sub bs-liveops-rail-lede">
              Live SLA-backed work items across support, ops, warehouse, finance, and vendor flows.
            </p>
            <div className="bs-liveops-stat bs-liveops-stat-primary">
              <span className="bs-liveops-stat-label">Active items</span>
              <span className="bs-liveops-stat-value">{railStats.total}</span>
            </div>
            <div className="bs-liveops-stat">
              <span className="bs-liveops-stat-label">Breach / critical window</span>
              <span className="bs-liveops-stat-value text-danger">{railStats.breachedOrHot}</span>
            </div>
            <div className="bs-liveops-stat">
              <span className="bs-liveops-stat-label">Exposure (high + critical)</span>
              <span className="bs-liveops-stat-value">{formatMoneyInr(railStats.impactAtRisk)}</span>
            </div>
            <div className="bs-liveops-risk-breakdown">
              <span className="bs-liveops-rail-section-label">By risk</span>
              <ul className="bs-liveops-risk-list">
                {(["critical", "high", "medium", "low"] as const).map((level) => (
                  <li key={level}>
                    <span className={`bs-liveops-risk-dot bs-liveops-risk-${level}`} aria-hidden />
                    <span className="bs-liveops-risk-name">{level}</span>
                    <strong>{railStats.byRisk[level]}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <NavLink to="/actions" className="btn btn-secondary btn-sm bs-liveops-rail-link">
              Open approvals
            </NavLink>
            <p className="td-sub bs-liveops-rail-footnote">
              Stages are local until synced to the server. Sort defaults to worst risk first.
            </p>
          </div>
        </aside>
      </div>

      {drawerItem ? (
        <div
          className="bs-drawer-backdrop"
          role="presentation"
          onClick={() => setDrawerItem(null)}
        >
          <div
            className="bs-drawer-panel card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bs-liveops-drawer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header bs-drawer-header">
              <div>
                <div id="bs-liveops-drawer-title" className="card-title">
                  {drawerItem.title}
                </div>
                <div className="card-subtitle td-sub">
                  #{drawerItem.id} · {drawerItem.item_type}
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDrawerItem(null)}>
                Close
              </button>
            </div>
            <div className="card-body bs-drawer-body">
              <section className="bs-drawer-section">
                <h4 className="bs-drawer-section-title">SLA &amp; deadlines</h4>
                <dl className="bs-drawer-dl">
                  <dt>Assigned SLA</dt>
                  <dd>{drawerItem.assigned_sla_name ?? "—"}</dd>
                  <dt>Risk</dt>
                  <dd>{drawerItem.predicted_breach_risk}</dd>
                  <dt>Time remaining</dt>
                  <dd>{drawerItem.time_remaining_minutes} minutes</dd>
                  <dt>Response deadline</dt>
                  <dd>{drawerItem.response_deadline ? formatDateTime(drawerItem.response_deadline) : "—"}</dd>
                  <dt>Resolution deadline</dt>
                  <dd>{drawerItem.resolution_deadline ? formatDateTime(drawerItem.resolution_deadline) : "—"}</dd>
                  <dt>Suggested action</dt>
                  <dd>{drawerItem.suggested_action || "—"}</dd>
                </dl>
                {drawerItem.match_rationale.length > 0 ? (
                  <>
                    <h5 className="bs-drawer-subtitle">Match rationale</h5>
                    <ul className="td-sub bs-drawer-list">
                      {drawerItem.match_rationale.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </section>

              {cls ? (
                <section className="bs-drawer-section">
                  <h4 className="bs-drawer-section-title">Classification</h4>
                  <dl className="bs-drawer-dl">
                    <dt>Workflow type</dt>
                    <dd>{cls.workflow_type}</dd>
                    <dt>Workflow category</dt>
                    <dd>{cls.workflow_category}</dd>
                    <dt>Priority</dt>
                    <dd>{cls.priority}</dd>
                    <dt>Customer tier</dt>
                    <dd>{cls.customer_tier}</dd>
                    <dt>Business unit</dt>
                    <dd>{cls.business_unit}</dd>
                    <dt>Department</dt>
                    <dd>{cls.department_name}</dd>
                    <dt>Confidence</dt>
                    <dd>{(cls.confidence * 100).toFixed(0)}%</dd>
                    <dt>Inferred value</dt>
                    <dd>{formatMoneyInr(cls.inferred_estimated_value)}</dd>
                    <dt>Escalate alert</dt>
                    <dd>{cls.should_raise_alert ? "Yes" : "No"}</dd>
                  </dl>
                  {cls.detected_sla_signals.length > 0 ? (
                    <>
                      <h5 className="bs-drawer-subtitle">Detected SLA signals</h5>
                      <ul className="td-sub bs-drawer-list">
                        {cls.detected_sla_signals.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {cls.risk_flags.length > 0 ? (
                    <>
                      <h5 className="bs-drawer-subtitle">Risk flags</h5>
                      <ul className="td-sub bs-drawer-list">
                        {cls.risk_flags.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {cls.rationale.length > 0 ? (
                    <>
                      <h5 className="bs-drawer-subtitle">Rationale</h5>
                      <ul className="td-sub bs-drawer-list">
                        {cls.rationale.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </section>
              ) : (
                <p className="td-sub">
                  Classification detail appears for items created via intake on this session, or once the API attaches
                  metadata to list responses.
                </p>
              )}

              {preview ? (
                <section className="bs-drawer-section bs-drawer-approval-preview">
                  <h4 className="bs-drawer-section-title">Approval preview</h4>
                  <dl className="bs-drawer-dl">
                    <dt>Auto-approve</dt>
                    <dd>{preview.should_auto_approve ? "Yes" : "No"}</dd>
                    <dt>Recommended approver</dt>
                    <dd>{preview.recommended_approver}</dd>
                    <dt>Confidence</dt>
                    <dd>{(preview.confidence * 100).toFixed(0)}%</dd>
                    <dt>Reasoning</dt>
                    <dd>{preview.reasoning}</dd>
                  </dl>
                </section>
              ) : null}

              {drawerItem.intakeContext?.recommendation_id != null ? (
                <NavLink
                  className="btn btn-secondary btn-sm"
                  to={`/actions?intakeRec=${drawerItem.intakeContext.recommendation_id}`}
                  onClick={() => setDrawerItem(null)}
                >
                  View related recommendation in approvals
                </NavLink>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
