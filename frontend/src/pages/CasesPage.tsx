import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { CaseSummary, CasesListParams } from "../domain/business-sentry";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { FilterBar } from "../components/business-sentry/FilterBar";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { formatMoneyInr, formatDateTime, formatModuleLabel } from "../lib/formatters";
import { useCaseDetail, useCasesList } from "../hooks/useBusinessSentry";

type CasesPageProps = {
  organizationId?: number;
};

function uniq(vals: string[]): string[] {
  return [...new Set(vals)].filter(Boolean).sort();
}

export function CasesPage({ organizationId }: CasesPageProps) {
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
      caseTypes: uniq(rows.map((r) => r.case_type)),
      modules: uniq(rows.map((r) => r.module)),
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

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Select a workspace" description="Choose an organization in the sidebar." />
      </div>
    );
  }

  return (
    <div className="page-content bs-cases-layout">
      <PageHeader
        title="Cases"
        subtitle="Ranked issues from detection — filter by team, vendor, type, detector, approver, and action state."
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
          {filterOptions.teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className="bs-select" value={vendor} onChange={(e) => setVendor(e.target.value)}>
          <option value="">Vendor (all)</option>
          {filterOptions.vendors.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className="bs-select" value={module} onChange={(e) => setModule(e.target.value)}>
          <option value="">Module (all)</option>
          {filterOptions.modules.map((t) => (
            <option key={t} value={t}>
              {formatModuleLabel(t)}
            </option>
          ))}
        </select>
        <select className="bs-select" value={detector} onChange={(e) => setDetector(e.target.value)}>
          <option value="">Detector (all)</option>
          {filterOptions.detectors.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className="bs-select" value={approver} onChange={(e) => setApprover(e.target.value)}>
          <option value="">Approver (all)</option>
          {filterOptions.approvers.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className="bs-select" value={actionState} onChange={(e) => setActionState(e.target.value)}>
          <option value="">Action state (all)</option>
          {filterOptions.actionStates.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className="bs-select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">Severity (all)</option>
          {filterOptions.severities.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className="bs-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Status (all)</option>
          {filterOptions.statuses.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </FilterBar>

      {listQ.isPending ? (
        <StateBlock title="Loading cases" loading />
      ) : listQ.isError ? (
        <StateBlock title="Failed to load cases" />
      ) : !listQ.data?.length ? (
        <StateBlock title="No cases match filters" description="Clear filters or bootstrap demo data." />
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
                  {listQ.data.map((c) => (
                    <CaseRow key={c.id} c={c} onOpen={() => openCase(c.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {caseId ? (
        <div className="bs-drawer-backdrop" role="presentation" onClick={closeCase}>
          <aside
            className="bs-drawer"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bs-drawer-header">
              <h2>Case detail</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeCase}>
                Close
              </button>
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
          <span className="badge badge-default">{c.sla_countdown_minutes}m · {c.sla_risk_level}</span>
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

function CaseDetailPanel({ d }: { d: import("../domain/business-sentry").CaseDetail }) {
  const s = d.summary;
  return (
    <div className="bs-detail-stack">
      <section>
        <h3>{s.title}</h3>
        <p className="bs-muted">{s.summary}</p>
        <div className="bs-pill-row">
          <span className={`badge badge-${s.severity}`}>{s.severity}</span>
          <span className="badge badge-default">{formatModuleLabel(s.module)}</span>
          <span className="badge badge-default">{s.status}</span>
        </div>
      </section>
      <section>
        <h4>Why flagged</h4>
        <p>{d.why_flagged}</p>
      </section>
      <section>
        <h4>Evidence</h4>
        <ul className="bs-list">
          {d.evidence.length === 0 ? <li className="bs-muted">No evidence rows (stub).</li> : null}
          {d.evidence.map((e) => (
            <li key={e.id}>
              <strong>{e.label}</strong> <span className="bs-muted">({e.kind})</span>
              <div className="td-sub">{e.snippet}</div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Related entities</h4>
        <ul className="bs-list">
          {d.related_entities.map((r) => (
            <li key={`${r.type}-${r.id}`}>
              {r.type}: {r.name}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Root cause</h4>
        <p>{d.root_cause}</p>
        <p className="td-sub">{d.baseline_comparison}</p>
      </section>
      {d.sla ? (
        <section>
          <h4>SLA</h4>
          <p>{d.sla.name}</p>
          <p className="td-sub">Response by {formatDateTime(d.sla.response_deadline)}</p>
          <p className="td-sub">Resolve by {formatDateTime(d.sla.resolution_deadline)}</p>
          <p>Penalty if breach: {formatMoneyInr(d.sla.penalty_if_breach)}</p>
        </section>
      ) : null}
      <section>
        <h4>Money at risk</h4>
        <p className="bs-money">{formatMoneyInr(d.financial_impact.amount)}</p>
        <p className="td-sub">Confidence: {(d.financial_impact.confidence * 100).toFixed(0)}%</p>
        <p className="td-sub">
          <strong>Formula:</strong> {d.formula}
        </p>
      </section>
      <section>
        <h4>Recommended action</h4>
        <p>{d.recommended_action.label}</p>
      </section>
      <section>
        <h4>Approval chain</h4>
        <ul className="bs-list">
          {d.approval_chain.map((a) => (
            <li key={a.step}>
              Step {a.step}: {a.role} — {a.name} ({a.state})
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Timeline</h4>
        <ul className="bs-list">
          {d.timeline.map((t, i) => (
            <li key={i}>
              {formatDateTime(t.at)} — {t.event} <span className="bs-muted">({t.actor})</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
