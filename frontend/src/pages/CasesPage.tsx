import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { CaseDetail, CaseSummary } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { FilterBar } from "../components/business-sentry/FilterBar";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { demoCaseDetails, demoCases } from "../demo/businessSentryHardcoded";
import { formatDateTime, formatModuleLabel, formatMoneyInr } from "../lib/formatters";

type CasesPageProps = { organizationId?: number };
type AddTicketPhase = "form" | "processing" | "result";

function uniq(vals: string[]) {
  return [...new Set(vals)].filter(Boolean).sort();
}
function bySeverity(value: string) {
  const order: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return order[value] ?? 0;
}
function accentClass(severity: string) {
  if (severity === "critical") return "ticket-accent-critical";
  if (severity === "high") return "ticket-accent-high";
  if (severity === "medium") return "ticket-accent-medium";
  return "ticket-accent-low";
}

/* ── AI ticket generation (simulated) ─────────────────────── */
const AI_TAGS: string[][] = [
  ["contract-dispute", "vendor:RapidFleet", "module:procurement", "auto-flagged"],
  ["sla-breach-risk", "late-delivery", "module:sla-sentinel", "ai-detected"],
  ["cost-overrun", "vendor:PolarNest", "cold-chain", "recurring"],
];
const AI_ACTIONS = [
  "Hold disputed line items and request vendor credit note",
  "Escalate to Fleet Control — rebalance rider allocation",
  "Trigger cold-chain incident protocol and reroute chilled orders",
];
const AI_SLAS = ["SLA-AP-02 · Response 4h · Resolution 24h", "SLA-LM-01 · Response 2h · Resolution 12h", "SLA-CC-03 · Response 1h · Resolution 6h"];

function generateAiData(title: string) {
  const idx = Math.abs(title.length) % 3;
  return {
    tags: AI_TAGS[idx],
    severity: "high" as const,
    cost_estimate: 145000 + idx * 100000,
    sla: AI_SLAS[idx],
    action: AI_ACTIONS[idx],
    team: "Procurement Team",
    approver: "Ananya Shah",
  };
}

/* ── Add Ticket Drawer ─────────────────────────────────────── */
function AddTicketDrawer({ onClose, onAdd }: { onClose: () => void; onAdd: (c: CaseSummary) => void }) {
  const [phase, setPhase] = useState<AddTicketPhase>("form");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [aiData, setAiData] = useState<ReturnType<typeof generateAiData> | null>(null);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setPhase("processing");
    await new Promise((r) => setTimeout(r, 2800));
    setAiData(generateAiData(title));
    setPhase("result");
  };

  const handleAdd = () => {
    if (!aiData) return;
    const newCase = {
      id: `CASE-AI-${Date.now()}`,
      title,
      summary: description || "AI-analyzed case from manual submission.",
      case_type: "cost_anomaly",
      severity: aiData.severity,
      status: "open",
      module: "procurewatch",
      team: aiData.team,
      vendor: "RapidFleet Logistics",
      detector_name: "Manual submission",
      approver_name: aiData.approver,
      approval_state: "pending",
      action_state: "unactioned",
      projected_impact: aiData.cost_estimate,
      sla_countdown_minutes: 480,
      sla_risk_level: "medium",
      created_at: new Date().toISOString(),
    } as unknown as CaseSummary;
    onAdd(newCase);
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
        {/* Header */}
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

        {/* Body */}
        <div className="bs-drawer-body" style={{ flex: 1, overflowY: "auto" }}>
          {/* — FORM PHASE — */}
          {phase === "form" && (
            <div className="new-ticket-form">
              <p className="td-sub" style={{ lineHeight: 1.6 }}>
                Fill in the basics — AI will automatically detect patterns, estimate cost impact, and link SLA rules.
              </p>
              <label className="bs-field">
                <span>Title</span>
                <input
                  className="bs-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Invoice rate variance above contracted threshold"
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
                  placeholder="Describe the anomaly — vendor, time window, what you observed..."
                  style={{ minHeight: 120, fontSize: 13.5, lineHeight: 1.6 }}
                />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "100%", padding: "12px 0", fontSize: 14, fontWeight: 600, marginTop: 4 }}
                disabled={!title.trim()}
                onClick={handleSubmit}
              >
                ✦ Analyze with AI
              </button>
            </div>
          )}

          {/* — PROCESSING PHASE — */}
          {phase === "processing" && (
            <div className="ai-processing-state">
              <div className="ai-spinner-wrap">
                <div className="ai-spinner-ring" />
                <div className="ai-spinner-inner" />
              </div>
              <div className="ai-processing-label">AI is analyzing your ticket…</div>
              <div className="ai-processing-sub">
                Detecting cost patterns, estimating financial exposure, and matching SLA rules
              </div>
              <div className="ai-skeleton-block" style={{ width: "100%" }}>
                <div className="ai-skeleton" style={{ width: "75%" }} />
                <div className="ai-skeleton" style={{ width: "55%" }} />
                <div className="ai-skeleton" style={{ width: "88%" }} />
                <div className="ai-skeleton" style={{ width: "65%" }} />
                <div className="ai-skeleton" style={{ width: "45%" }} />
              </div>
            </div>
          )}

          {/* — RESULT PHASE — */}
          {phase === "result" && aiData && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Ticket title recap */}
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
                  <div className="td-sub" style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5 }}>
                    {description.slice(0, 100)}{description.length > 100 ? "…" : ""}
                  </div>
                )}
              </div>

              {/* AI tags */}
              <div className="ai-result-field">
                <div className="ai-result-label">✦ AI-Generated Tags</div>
                <div className="ai-tags-row">
                  {aiData.tags.map((tag) => (
                    <span key={tag} className="ai-tag">{tag}</span>
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div className="ai-result-field">
                <div className="ai-result-label">Priority</div>
                <span className={`badge badge-${aiData.severity}`} style={{ fontSize: 12.5, padding: "4px 12px" }}>
                  {aiData.severity.charAt(0).toUpperCase() + aiData.severity.slice(1)}
                </span>
              </div>

              {/* Cost estimation */}
              <div className="ai-result-field">
                <div className="ai-result-label">Cost Estimation</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.025em" }}>
                  {formatMoneyInr(aiData.cost_estimate)}
                </div>
                <div className="td-sub" style={{ marginTop: 3 }}>Projected financial exposure at risk</div>
              </div>

              {/* SLA connected */}
              <div className="ai-result-field">
                <div className="ai-result-label">SLA Connected</div>
                <span className="badge badge-blue" style={{ fontSize: 12, padding: "4px 10px" }}>
                  {aiData.sla}
                </span>
              </div>

              {/* Recommended action */}
              <div className="ai-result-field">
                <div className="ai-result-label">Recommended Action</div>
                <div
                  style={{
                    fontSize: 13.5,
                    color: "var(--text-1)",
                    padding: "12px 14px",
                    background: "var(--surface-2)",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    lineHeight: 1.55,
                  }}
                >
                  {aiData.action}
                </div>
              </div>

              {/* Assigned */}
              <div className="ai-result-field">
                <div className="ai-result-label">Suggested Owner</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: "linear-gradient(135deg, #2031C4, #33AABD)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, color: "white", flexShrink: 0,
                    }}
                  >
                    {aiData.approver.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-1)" }}>{aiData.approver}</div>
                    <div className="td-sub">{aiData.team}</div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "100%", padding: "13px 0", fontSize: 14, fontWeight: 600, marginTop: 4 }}
                onClick={handleAdd}
              >
                Add to Queue
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ── Ticket Card ───────────────────────────────────────────── */
function TicketCard({
  c,
  onOpen,
  isNew,
}: {
  c: CaseSummary;
  onOpen: () => void;
  isNew: boolean;
}) {
  return (
    <div
      className="ticket-card"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
    >
      <div className={`ticket-card-accent ${accentClass(c.severity)}`} />
      <div className="ticket-card-body">
        <div className="ticket-card-top">
          <span className={`badge badge-${c.severity}`}>{c.severity}</span>
          {isNew && <span className="badge badge-green" style={{ fontSize: 10 }}>NEW</span>}
          <span className="badge badge-default">{formatModuleLabel(c.module)}</span>
          {c.sla_countdown_minutes != null && (
            <span
              className="bs-muted"
              style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11 }}
            >
              SLA {c.sla_countdown_minutes}m
            </span>
          )}
        </div>
        <div className="ticket-card-title">{c.title}</div>
        <div className="ticket-card-sub">{c.summary}</div>
      </div>
      <div className="ticket-card-right">
        <div className="ticket-card-impact">{formatMoneyInr(c.projected_impact)}</div>
        <div className="ticket-card-sla">{c.status} · {c.team}</div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ color: "var(--text-3)" }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </div>
  );
}

/* ── State param helper ────────────────────────────────────── */
function useStateParam(
  searchParams: URLSearchParams,
  setSearchParams: (cb: (p: URLSearchParams) => URLSearchParams) => void,
  key: string,
  defaultVal: string,
): [string, (v: string) => void] {
  const raw = searchParams.get(key);
  const value = raw ?? defaultVal;
  const setValue = (v: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!v || v === defaultVal) next.delete(key);
      else next.set(key, v);
      return next;
    });
  };
  return [value, setValue];
}

/* ── Case Detail Panel (unchanged) ────────────────────────── */
function CaseDetailPanel({ d }: { d: CaseDetail }) {
  const s = d.summary;
  return (
    <div className="bs-detail-stack">
      <section className="bs-detail-hero">
        <h3>{s.title}</h3>
        <p className="bs-muted" style={{ marginBottom: 12 }}>{s.summary}</p>
        <div className="bs-pill-row">
          <span className={`badge badge-${s.severity}`}>{s.severity}</span>
          <span className="badge badge-default">{formatModuleLabel(s.module)}</span>
          <span className="badge badge-default">{s.status}</span>
        </div>
      </section>
      <section className="bs-detail-card">
        <h4>Money at risk</h4>
        <p className="bs-money text-danger">{formatMoneyInr(d.financial_impact.amount)}</p>
        <p className="td-sub">Confidence: {(d.financial_impact.confidence * 100).toFixed(0)}%</p>
        <div className="bs-detail-formula"><strong>Formula:</strong> {d.formula}</div>
      </section>
      <section className="bs-detail-card">
        <h4>Why flagged</h4>
        <p>{d.why_flagged}</p>
      </section>
      <section className="bs-detail-card">
        <h4>Root cause</h4>
        <p>{d.root_cause}</p>
        <p className="td-sub" style={{ marginTop: 8 }}>{d.baseline_comparison}</p>
      </section>
      {d.sla ? (
        <section className="bs-detail-card bs-detail-sla">
          <h4>SLA: {d.sla.name}</h4>
          <div className="bs-sla-grid">
            <div className="bs-sla-item">
              <span className="bs-muted">Response by</span>
              <strong>{formatDateTime(d.sla.response_deadline)}</strong>
            </div>
            <div className="bs-sla-item">
              <span className="bs-muted">Resolve by</span>
              <strong>{formatDateTime(d.sla.resolution_deadline)}</strong>
            </div>
            <div className="bs-sla-item">
              <span className="bs-muted">Penalty</span>
              <strong className="text-danger">{formatMoneyInr(d.sla.penalty_if_breach)}</strong>
            </div>
          </div>
        </section>
      ) : null}
      <section className="bs-detail-card">
        <h4>Recommended action</h4>
        <p>{d.recommended_action.label}</p>
      </section>
      <section className="bs-detail-card">
        <h4>Evidence</h4>
        {d.evidence.map((item) => (
          <div key={item.id} className="bs-evidence-item">
            <strong>{item.label}</strong>
            <div className="bs-evidence-snippet">{item.snippet}</div>
          </div>
        ))}
      </section>
      <section className="bs-detail-card">
        <h4>Approval chain</h4>
        <ul className="bs-list">
          {d.approval_chain.map((step) => (
            <li key={step.step}>
              {step.step}. {step.role} · {step.name} · {step.state}
            </li>
          ))}
        </ul>
      </section>
      <section className="bs-detail-card">
        <h4>Timeline</h4>
        <ul className="bs-timeline-list">
          {d.timeline.map((event, index) => (
            <li key={`${event.at}-${index}`}>
              <span className="bs-timeline-dot" />
              <div className="bs-timeline-content">
                <strong>{event.event}</strong>
                <span className="td-sub">{event.actor} · {formatDateTime(event.at)}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────── */
export function CasesPage(_: CasesPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [addedCases, setAddedCases] = useState<CaseSummary[]>([]);
  const [showAddTicket, setShowAddTicket] = useState(false);

  const caseId = searchParams.get("case");
  const [sort, setSort] = useStateParam(searchParams, setSearchParams, "sort", "severity");
  const [severity, setSeverity] = useStateParam(searchParams, setSearchParams, "severity", "");
  const [status, setStatus] = useStateParam(searchParams, setSearchParams, "status", "");
  const [module, setModule] = useStateParam(searchParams, setSearchParams, "module", "");
  const [team, setTeam] = useStateParam(searchParams, setSearchParams, "team", "");
  const [vendor, setVendor] = useStateParam(searchParams, setSearchParams, "vendor", "");
  const [detector, setDetector] = useStateParam(searchParams, setSearchParams, "detector", "");
  const [approver, setApprover] = useStateParam(searchParams, setSearchParams, "approver", "");
  const [actionState, setActionState] = useStateParam(searchParams, setSearchParams, "action_state", "");

  const allCases = useMemo(() => [...addedCases, ...demoCases], [addedCases]);

  const filterOptions = useMemo(
    () => ({
      teams: uniq(allCases.map((r) => r.team)),
      vendors: uniq(allCases.map((r) => r.vendor)),
      modules: uniq(allCases.map((r) => r.module)),
      detectors: uniq(allCases.map((r) => r.detector_name)),
      approvers: uniq(allCases.map((r) => r.approver_name)),
      actionStates: uniq(allCases.map((r) => r.action_state)),
      severities: uniq(allCases.map((r) => r.severity)),
      statuses: uniq(allCases.map((r) => r.status)),
    }),
    [allCases],
  );

  const rows = useMemo(() => {
    const filtered = allCases.filter((row) => {
      if (severity && row.severity !== severity) return false;
      if (status && row.status !== status) return false;
      if (module && row.module !== module) return false;
      if (team && row.team !== team) return false;
      if (vendor && row.vendor !== vendor) return false;
      if (detector && row.detector_name !== detector) return false;
      if (approver && row.approver_name !== approver) return false;
      if (actionState && row.action_state !== actionState) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sort === "cost_impact") return b.projected_impact - a.projected_impact;
      if (sort === "deadline") return (a.sla_countdown_minutes ?? 999999) - (b.sla_countdown_minutes ?? 999999);
      if (sort === "sla_risk") return bySeverity(b.sla_risk_level) - bySeverity(a.sla_risk_level);
      if (sort === "newest") return Date.parse(b.created_at) - Date.parse(a.created_at);
      if (sort === "status") return a.status.localeCompare(b.status);
      return bySeverity(b.severity) - bySeverity(a.severity) || b.projected_impact - a.projected_impact;
    });
  }, [actionState, approver, detector, module, severity, sort, status, team, vendor, allCases]);

  const addedIds = useMemo(() => new Set(addedCases.map((c) => c.id)), [addedCases]);
  const detail = caseId ? demoCaseDetails[caseId] ?? null : null;

  const openCase = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("case", id);
      return next;
    });
  };
  const closeCase = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("case");
      return next;
    });
  };

  return (
    <div className="page-content bs-cases-layout">
      <PageHeader
        title="Cases"
        subtitle="Ranked issues from saved anomaly detectors. Click any case to view full details."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowAddTicket(true)}
          >
            + New Ticket
          </button>
        }
      />

      <FilterBar>
        <select className="bs-select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="severity">Sort: severity</option>
          <option value="cost_impact">Sort: cost impact</option>
          <option value="deadline">Sort: deadline (SLA)</option>
          <option value="sla_risk">Sort: SLA risk</option>
          <option value="newest">Sort: newest</option>
          <option value="status">Sort: status</option>
        </select>
        <select className="bs-select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">Severity (all)</option>
          {filterOptions.severities.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="bs-select" value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">Team (all)</option>
          {filterOptions.teams.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="bs-select" value={vendor} onChange={(e) => setVendor(e.target.value)}>
          <option value="">Vendor (all)</option>
          {filterOptions.vendors.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="bs-select" value={module} onChange={(e) => setModule(e.target.value)}>
          <option value="">Module (all)</option>
          {filterOptions.modules.map((item) => <option key={item} value={item}>{formatModuleLabel(item)}</option>)}
        </select>
        <select className="bs-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Status (all)</option>
          {filterOptions.statuses.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="bs-select" value={actionState} onChange={(e) => setActionState(e.target.value)}>
          <option value="">Action state (all)</option>
          {filterOptions.actionStates.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </FilterBar>

      {!rows.length ? (
        <StateBlock title="No cases match filters" description="Clear a few filters to bring the ranked case list back." />
      ) : (
        <div className="ticket-list">
          {rows.map((row) => (
            <TicketCard
              key={row.id}
              c={row}
              onOpen={() => openCase(row.id)}
              isNew={addedIds.has(row.id)}
            />
          ))}
        </div>
      )}

      {/* Case detail drawer */}
      {caseId ? (
        <div className="bs-drawer-backdrop" role="presentation" onClick={closeCase}>
          <aside className="bs-drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="bs-drawer-header">
              <h2>Case detail</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeCase}>Close</button>
            </div>
            <div className="bs-drawer-body">
              {detail ? <CaseDetailPanel d={detail} /> : <StateBlock title="Case not found" />}
            </div>
          </aside>
        </div>
      ) : null}

      {/* Add ticket drawer */}
      {showAddTicket && (
        <AddTicketDrawer
          onClose={() => setShowAddTicket(false)}
          onAdd={(c) => {
            setAddedCases((prev) => [c, ...prev]);
            setShowAddTicket(false);
          }}
        />
      )}
    </div>
  );
}
