import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { CaseDetail, CaseSummary, CasesListParams } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { FilterBar } from "../components/business-sentry/FilterBar";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { useNotifications } from "../components/shared/Notifications";
import { formatDateTime, formatModuleLabel, formatMoneyInr } from "../lib/formatters";
import { useCaseDetail, useCasesList, useCreateTicketIntake } from "../hooks/useBusinessSentry";

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

/* ── Add Ticket Drawer ─────────────────────────────────────── */
function AddTicketDrawer({ 
  onClose, 
  onAdd,
  organizationId,
}: { 
  onClose: () => void; 
  onAdd: (c: CaseSummary) => void;
  organizationId?: number;
}) {
  const [phase, setPhase] = useState<AddTicketPhase>("form");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [aiResult, setAiResult] = useState<any>(null);

  const ticketMut = useCreateTicketIntake(organizationId);
  const { notify } = useNotifications();

  const handleSubmit = async () => {
    if (!title.trim() || !organizationId) return;
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

  const handleAdd = () => {
    if (!aiResult) return;
    const liveItem = aiResult.live_item;
    const newCase = {
      id: `CASE-${liveItem.id}`,
      title: liveItem.title,
      summary: description || "AI-analyzed case from manual submission.",
      case_type: aiResult.classification?.workflow_category || "support_ticket",
      severity: aiResult.classification?.priority === "high" ? "high" : 
                aiResult.classification?.priority === "medium" ? "medium" : "low",
      status: "open",
      module: aiResult.classification?.business_unit || "support",
      team: liveItem.team,
      vendor: aiResult.classification?.vendor_name || "",
      detector_name: "AI Intake",
      approver_name: "",
      approval_state: "pending",
      action_state: "unactioned",
      projected_impact: liveItem.projected_penalty || liveItem.contract_penalty || 0,
      sla_countdown_minutes: liveItem.time_remaining_minutes,
      sla_risk_level: liveItem.predicted_breach_risk,
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
      >
        <div className="bs-drawer-header">
          <h2>Create Ticket</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={phase === "processing"}
          >
            Close
          </button>
        </div>

        <div className="bs-drawer-body">
          {phase === "form" && (
            <div className="bs-detail-stack">
              <label className="bs-field">
                <span>Subject / Title</span>
                <input
                  autoFocus
                  className="bs-input"
                  placeholder="e.g. Discrepancy in warehouse power billing"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="bs-field">
                <span>Observation / Context</span>
                <textarea
                  className="bs-textarea"
                  rows={4}
                  placeholder="Any specific details help the AI classifier..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={!title.trim()}
                onClick={handleSubmit}
              >
                Ingest & Analyze
              </button>
            </div>
          )}

          {phase === "processing" && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="bs-ai-loader mb-6" />
              <div className="text-white font-bold mb-1">Semantic Classification</div>
              <div className="text-white/40 text-sm">Identifying entities and money-at-risk...</div>
            </div>
          )}

          {phase === "result" && aiResult && (
            <div className="bs-detail-stack bs-ai-result-view">
              <div className="bs-ai-result-head">
                <div className="text-emerald-400 font-mono text-[10px] uppercase tracking-wider mb-2">Analysis Complete</div>
                <h3 className="text-white font-bold text-xl leading-tight mb-2">{title}</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {aiResult.classification?.detected_sla_signals?.slice(0, 4).map((tag: string) => (
                    <span key={tag} className="badge badge-default">{tag}</span>
                  ))}
                  {aiResult.classification?.risk_flags?.slice(0, 2).map((tag: string) => (
                    <span key={tag} className="badge badge-default border-rose-500/30 text-rose-400">{tag}</span>
                  ))}
                </div>
              </div>

              <div className="bs-detail-card border-amber-500/20 bg-amber-500/[0.03]">
                <div className="text-amber-400/80 text-[10px] uppercase font-bold tracking-widest mb-3">SLA Context & Penalty Exposure</div>
                <div className="flex flex-col gap-4">
                   <div className="flex justify-between items-baseline">
                     <span className="text-white/40 text-xs">Penalty Exposure</span>
                     <span className="text-white font-mono font-bold">
                       {formatMoneyInr(aiResult.live_item.projected_penalty || aiResult.live_item.contract_penalty || 0)}
                     </span>
                   </div>
                   <div className="flex justify-between items-baseline">
                     <span className="text-white/40 text-xs">SLA Framework</span>
                     <span className="text-white text-xs">{aiResult.live_item.assigned_sla_name ?? "General Policy"}</span>
                   </div>
                   <div className="flex justify-between items-baseline">
                     <span className="text-white/40 text-xs">Response Deadline</span>
                     <span className="text-white text-xs">{formatDateTime(aiResult.live_item.response_deadline)}</span>
                   </div>
                   <div className="flex justify-between items-baseline">
                     <span className="text-white/40 text-xs">Resolution Deadline</span>
                     <span className="text-white text-xs">{formatDateTime(aiResult.live_item.resolution_deadline)}</span>
                   </div>
                   <div className="flex justify-between items-baseline">
                     <span className="text-white/40 text-xs">Time Remaining</span>
                     <span className="text-amber-400 font-bold">{aiResult.live_item.time_remaining_minutes}m</span>
                   </div>
                   <div className="pt-3 border-t border-white/5">
                     <div className="text-white/40 text-[10px] uppercase font-bold mb-1.5">Suggested Action</div>
                     <p className="text-white text-sm leading-relaxed">{aiResult.live_item.suggested_action}</p>
                   </div>
                </div>
              </div>

              <div className="bs-card-actions mt-4">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPhase("form")}>
                  Edit Prompt
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleAdd}>
                  Publish to Queue
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export function CasesPage({ organizationId }: CasesPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const caseId = searchParams.get("case");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [sort, setSort] = useStateParam(searchParams, setSearchParams, "sort", "severity");
  const [severity, setSeverity] = useStateParam(searchParams, setSearchParams, "severity", "");
  const [status, setStatus] = useStateParam(searchParams, setSearchParams, "status", "");
  const [module, setModule] = useStateParam(searchParams, setSearchParams, "module", "");
  const [team, setTeam] = useStateParam(searchParams, setSearchParams, "team", "");
  const [vendor, setVendor] = useStateParam(searchParams, setSearchParams, "vendor", "");
  const [detector, setDetector] = useStateParam(searchParams, setSearchParams, "detector", "");
  const [approver, setApprover] = useStateParam(searchParams, setSearchParams, "approver", "");
  const [actionState, setActionState] = useStateParam(searchParams, setSearchParams, "action_state", "");

  const params: CasesListParams = useMemo(
    () => ({
      sort: sort || undefined,
      severity: severity || undefined,
      status: status || undefined,
      module: module || undefined,
      team: team || undefined,
      vendor: vendor || undefined,
      detector: detector || undefined,
      approver: approver || undefined,
      action_state: actionState || undefined,
    }),
    [sort, severity, status, module, team, vendor, detector, approver, actionState],
  );

  const listQ = useCasesList(organizationId, params);
  const allQ = useCasesList(organizationId, {});
  const detailQ = useCaseDetail(caseId);

  const filterOptions = useMemo(() => {
    const rows = allQ.data ?? [];
    return {
      teams: uniq(rows.map((r) => r.team)),
      vendors: uniq(rows.map((r) => r.vendor)),
      caseTypes: uniq(rows.map((r) => (r.case_type || "").toString())),
      modules: uniq(rows.map((r) => (r.module || "").toString())),
      detectors: uniq(rows.map((r) => r.detector_name)),
      approvers: uniq(rows.map((r) => r.approver_name)),
      actionStates: uniq(rows.map((r) => r.action_state)),
      severities: uniq(rows.map((r) => r.severity)),
      statuses: uniq(rows.map((r) => r.status)),
    };
  }, [allQ.data]);

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

  const listData = useMemo(() => {
    const data = [...(listQ.data || [])];
    if (sort === "severity") {
      data.sort((a, b) => bySeverity(b.severity) - bySeverity(a.severity));
    } else if (sort === "cost_impact") {
      data.sort((a, b) => (b.projected_impact || 0) - (a.projected_impact || 0));
    }
    return data;
  }, [listQ.data, sort]);

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Create a workspace" description="Choose one from the top navigation." />
      </div>
    );
  }

  return (
    <div className="page-content bs-cases-layout">
      <PageHeader
        title="Tickets"
        subtitle="Ranked issues from detection — filter by team, vendor, type, detector, approver, and action state."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setIsAddOpen(true)}>
            + Create Ticket
          </button>
        }
      />

      <FilterBar>
        <select className="bs-select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="severity">Sort: severity</option>
          <option value="cost_impact">Sort: impact</option>
          <option value="newest">Sort: newest</option>
        </select>
        <select className="bs-select" value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">Team (all)</option>
          {filterOptions.teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="bs-select" value={vendor} onChange={(e) => setVendor(e.target.value)}>
          <option value="">Vendor (all)</option>
          {filterOptions.vendors.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="bs-select" value={module} onChange={(e) => setModule(e.target.value)}>
          <option value="">Module (all)</option>
          {filterOptions.modules.map((m) => <option key={m} value={m}>{formatModuleLabel(m)}</option>)}
        </select>
        <select className="bs-select" value={actionState} onChange={(e) => setActionState(e.target.value)}>
          <option value="">Action state (all)</option>
          {filterOptions.actionStates.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="bs-select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">Severity (all)</option>
          {filterOptions.severities.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </FilterBar>

      {listQ.isPending ? (
        <StateBlock title="Loading cases" loading />
      ) : listQ.isError ? (
        <StateBlock title="Failed to load cases" />
      ) : !listData.length ? (
        <StateBlock title="No cases match filters" description="Clear filters or bootstrap demo data." />
      ) : (
        <div className="bs-ticket-grid">
          {listData.map((c) => (
            <button key={c.id} className={`bs-ticket-card ${accentClass(c.severity)}`} onClick={() => openCase(c.id)}>
              <div className="bs-ticket-head">
                <div className="bs-ticket-id">#{c.id.split("-").pop()}</div>
                <div className={`badge badge-${c.severity}`}>{c.severity}</div>
              </div>
              <div className="bs-ticket-title">{c.title}</div>
              <div className="bs-ticket-summary">{c.summary}</div>
              <div className="bs-ticket-meta">
                <div className="bs-ticket-stat">
                   <span className="label">IMPACT</span>
                   <span className="val">{formatMoneyInr(c.projected_impact)}</span>
                </div>
                <div className="bs-ticket-stat">
                   <span className="label">TEAM</span>
                   <span className="val">{c.team}</span>
                </div>
              </div>
              <div className="bs-ticket-footer">
                <span className="bs-ticket-module">{formatModuleLabel(c.module)}</span>
                <span className="bs-ticket-date">{formatDateTime(c.created_at)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {caseId && (
        <div className="bs-drawer-backdrop" role="presentation" onClick={closeCase}>
          <aside className="bs-drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="bs-drawer-header">
              <h2>Case detail</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeCase}>Close</button>
            </div>
            <div className="bs-drawer-body">
              {detailQ.isPending ? (
                <StateBlock title="Loading…" loading />
              ) : detailQ.isError || !detailQ.data ? (
                <StateBlock title="Case not found" />
              ) : (
                <CaseDetailPanel d={detailQ.data} />
              )}
            </div>
          </aside>
        </div>
      )}

      {isAddOpen && (
        <AddTicketDrawer
          organizationId={organizationId}
          onClose={() => setIsAddOpen(false)}
          onAdd={(_newCase) => {
            // In a real app, this would be a mutation. 
            // In demo, we just notify for now as history is driven by useCasesList hook.
          }}
        />
      )}
    </div>
  );
}

function useStateParam(
  searchParams: URLSearchParams,
  setSearchParams: (cb: (p: URLSearchParams) => URLSearchParams) => void,
  key: string,
  defaultVal: string,
): [string, (v: string) => void] {
  const raw = searchParams.get(key);
  const value = raw ?? defaultVal;
  return [
    value,
    (v: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (!v || v === defaultVal) next.delete(key);
        else next.set(key, v);
        return next;
      });
    },
  ];
}

function CaseDetailPanel({ d }: { d: CaseDetail }) {
  const s = d.summary;
  return (
    <div className="bs-detail-stack" style={{ paddingBottom: 60 }}>
      {/* Premium Detail Header */}
      <section className="bs-detail-hero">
        <div className="flex items-center gap-2 mb-2">
           <span className={`badge badge-${s.severity}`}>{s.severity}</span>
           <span className="badge badge-default">{formatModuleLabel(s.module)}</span>
        </div>
        <h3>{s.title}</h3>
        <p className="bs-muted">{s.summary}</p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <section className="bs-detail-card bg-rose-500/[0.03]">
          <h4>Projected Leakage</h4>
          <p className="bs-money text-rose-500">{formatMoneyInr(d.financial_impact.amount)}</p>
          <div className="text-[10px] text-white/40 uppercase font-bold mt-2">CONFIDENCE: {(d.financial_impact.confidence * 100).toFixed(0)}%</div>
          <div className="bs-detail-formula mt-3">{d.formula}</div>
        </section>

        {d.sla ? (
          <section className="bs-detail-card border-amber-500/20">
            <h4>Active SLA: {d.sla.name}</h4>
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex justify-between text-xs">
                <span className="text-white/40">Response</span>
                <span className="text-white">{formatDateTime(d.sla.response_deadline)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/40">Resolution</span>
                <span className="text-white">{formatDateTime(d.sla.resolution_deadline)}</span>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t border-white/5">
                <span className="text-white/40">Penalty</span>
                <span className="text-amber-400 font-bold">{formatMoneyInr(d.sla.penalty_if_breach)}</span>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      <section className="bs-detail-card mt-4">
        <h4>Why flagged</h4>
        <p className="text-sm leading-relaxed text-white/80">{d.why_flagged}</p>
      </section>

      <section className="bs-detail-card mt-4">
        <h4>Root cause</h4>
        <p className="text-sm leading-relaxed text-white/80">{d.root_cause}</p>
        <div className="bg-white/[0.02] p-3 rounded mt-3 text-xs text-white/60 italic">
           {d.baseline_comparison}
        </div>
      </section>

      <section className="bs-detail-card mt-4">
        <h4>Recommended action</h4>
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-lg flex items-center gap-4">
           <div className="w-10 h-10 rounded-full bg-[#0A0F1C] border border-white/5 flex items-center justify-center text-emerald-400">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
           </div>
           <p className="text-white font-bold text-sm">{d.recommended_action.label}</p>
        </div>
      </section>

      <section className="bs-detail-card mt-4">
        <h4>Evidence</h4>
        <div className="flex flex-col gap-3">
          {d.evidence.map((e) => (
            <div key={e.id} className="bg-white/[0.02] border border-white/5 p-3 rounded flex flex-col gap-1">
              <div className="flex justify-between items-center">
                 <span className="text-white font-bold text-xs">{e.label}</span>
                 <span className="text-[10px] text-white/30 uppercase">{e.kind}</span>
              </div>
              <div className="text-[11px] font-mono text-white/60 leading-normal">{e.snippet}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="bs-detail-card mt-4">
        <h4>Timeline</h4>
        <div className="bs-timeline ml-2 border-l border-white/10 pl-6 pb-2">
           {d.timeline.map((t, i) => (
             <div key={i} className="relative mb-6 last:mb-0">
                <div className="absolute left-[-29px] top-1 w-2.5 h-2.5 rounded-full bg-white/20 border-2 border-[#03060E]" />
                <div className="text-xs text-white font-bold mb-0.5">{t.event}</div>
                <div className="text-[10px] text-white/40 uppercase">{formatDateTime(t.at)} · {t.actor}</div>
             </div>
           ))}
        </div>
      </section>
    </div>
  );
}
