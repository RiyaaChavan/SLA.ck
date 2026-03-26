import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { CaseDetail, CaseSummary } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { FilterBar } from "../components/business-sentry/FilterBar";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { demoCaseDetails, demoCases } from "../demo/businessSentryHardcoded";
import { formatDateTime, formatModuleLabel, formatMoneyInr } from "../lib/formatters";

type CasesPageProps = {
  organizationId?: number;
};

function uniq(vals: string[]) {
  return [...new Set(vals)].filter(Boolean).sort();
}

function bySeverity(value: string) {
  const order: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return order[value] ?? 0;
}

export function CasesPage(_: CasesPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
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

  const filterOptions = useMemo(
    () => ({
      teams: uniq(demoCases.map((row) => row.team)),
      vendors: uniq(demoCases.map((row) => row.vendor)),
      modules: uniq(demoCases.map((row) => row.module)),
      detectors: uniq(demoCases.map((row) => row.detector_name)),
      approvers: uniq(demoCases.map((row) => row.approver_name)),
      actionStates: uniq(demoCases.map((row) => row.action_state)),
      severities: uniq(demoCases.map((row) => row.severity)),
      statuses: uniq(demoCases.map((row) => row.status)),
    }),
    [],
  );

  const rows = useMemo(() => {
    const filtered = demoCases.filter((row) => {
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
  }, [actionState, approver, detector, module, severity, sort, status, team, vendor]);

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
        subtitle="Ranked issues from the saved anomaly detectors. Filters and detail views are fully interactive in this demo."
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
        <select className="bs-select" value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">Team (all)</option>
          {filterOptions.teams.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="bs-select" value={vendor} onChange={(e) => setVendor(e.target.value)}>
          <option value="">Vendor (all)</option>
          {filterOptions.vendors.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="bs-select" value={module} onChange={(e) => setModule(e.target.value)}>
          <option value="">Module (all)</option>
          {filterOptions.modules.map((item) => (
            <option key={item} value={item}>
              {formatModuleLabel(item)}
            </option>
          ))}
        </select>
        <select className="bs-select" value={detector} onChange={(e) => setDetector(e.target.value)}>
          <option value="">Detector (all)</option>
          {filterOptions.detectors.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="bs-select" value={approver} onChange={(e) => setApprover(e.target.value)}>
          <option value="">Approver (all)</option>
          {filterOptions.approvers.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="bs-select" value={actionState} onChange={(e) => setActionState(e.target.value)}>
          <option value="">Action state (all)</option>
          {filterOptions.actionStates.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="bs-select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">Severity (all)</option>
          {filterOptions.severities.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select className="bs-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Status (all)</option>
          {filterOptions.statuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </FilterBar>

      {!rows.length ? (
        <StateBlock title="No cases match filters" description="Clear a few filters to bring the ranked case list back." />
      ) : (
        <div className="card">
          <div className="card-body-flush">
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>SLA</th>
                    <th>Impact</th>
                    <th>Approval / action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <CaseRow key={row.id} c={row} onOpen={() => openCase(row.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {caseId ? (
        <div className="bs-drawer-backdrop" role="presentation" onClick={closeCase}>
          <aside className="bs-drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="bs-drawer-header">
              <h2>Case detail</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeCase}>
                Close
              </button>
            </div>
            <div className="bs-drawer-body">
              {detail ? <CaseDetailPanel d={detail} /> : <StateBlock title="Case not found" />}
            </div>
          </aside>
        </div>
      ) : null}
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

function CaseRow({ c, onOpen }: { c: CaseSummary; onOpen: () => void }) {
  return (
    <tr className="bs-click-row" onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()} tabIndex={0}>
      <td>
        <div className="td-main">{c.title}</div>
        <div className="td-sub">{c.summary}</div>
      </td>
      <td>
        <span className="bs-muted">{c.case_type.replaceAll("_", " ")}</span>
      </td>
      <td>
        <span className={`badge badge-${c.severity}`}>{c.severity}</span>
      </td>
      <td>
        {c.sla_countdown_minutes != null ? (
          <span className="badge badge-default">
            {c.sla_countdown_minutes}m · {c.sla_risk_level}
          </span>
        ) : (
          <span className="bs-muted">—</span>
        )}
      </td>
      <td>{formatMoneyInr(c.projected_impact)}</td>
      <td>
        <div className="td-sub">{c.approval_state}</div>
        <div className="td-sub">{c.action_state}</div>
      </td>
    </tr>
  );
}

function CaseDetailPanel({ d }: { d: CaseDetail }) {
  const s = d.summary;
  return (
    <div className="bs-detail-stack">
      <section className="bs-detail-hero">
        <h3>{s.title}</h3>
        <p className="bs-muted" style={{ marginBottom: 12 }}>
          {s.summary}
        </p>
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
        <div className="bs-detail-formula">
          <strong>Formula:</strong> {d.formula}
        </div>
      </section>
      <section className="bs-detail-card">
        <h4>Why flagged</h4>
        <p>{d.why_flagged}</p>
      </section>
      <section className="bs-detail-card">
        <h4>Root cause</h4>
        <p>{d.root_cause}</p>
        <p className="td-sub" style={{ marginTop: 8 }}>
          {d.baseline_comparison}
        </p>
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
                <span className="td-sub">
                  {event.actor} · {formatDateTime(event.at)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
