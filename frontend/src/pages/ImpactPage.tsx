import { SectionCard } from "../components/shared/SectionCard";
import { StatCard } from "../components/shared/StatCard";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { formatMoneyInr, formatModuleLabel } from "../lib/formatters";
import { useImpactOverview } from "../hooks/useBusinessSentry";
import { NavLink } from "react-router-dom";

type ImpactPageProps = {
  organizationId?: number;
};

export function ImpactPage({ organizationId }: ImpactPageProps) {
  const q = useImpactOverview(organizationId);

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Select a workspace" description="Choose an organization in the sidebar after bootstrapping data." />
      </div>
    );
  }

  if (q.isPending) {
    return (
      <div className="page-content">
        <StateBlock title="Loading impact" loading />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="page-content">
        <StateBlock title="Could not load impact" description={(q.error as Error)?.message ?? "Unknown error"} />
      </div>
    );
  }

  const d = q.data;
  const funnel = d.approval_execution_funnel;
  const maxBar = Math.max(
    ...d.realized_vs_projected.realized_savings.map((v, i) => Math.max(v, d.realized_vs_projected.projected_savings[i] ?? 0)),
    1,
  );

  return (
    <div className="page-content">
      <PageHeader
        title="Anomalies"
        subtitle={`Dashboard for ${d.organization.name} — money at risk, savings trend, and approval funnel.`}
      />

      <div className="stat-grid">
        {d.metrics.map((m) => (
          <StatCard
            key={m.label}
            label={m.label}
            value={
              m.label.toLowerCase().includes("case") || m.label.toLowerCase().includes("breach")
                ? String(Math.round(m.value))
                : formatMoneyInr(m.value)
            }
            delta={m.delta != null ? `${m.delta > 0 ? "+" : ""}${m.delta}%` : undefined}
          />
        ))}
      </div>

      <div className="split-grid">
        <SectionCard title="Realized vs projected savings" subtitle="Weekly trend (demo currency)">
          <div className="bs-chart-bars">
            {d.realized_vs_projected.periods.map((p, i) => {
              const r = d.realized_vs_projected.realized_savings[i] ?? 0;
              const pr = d.realized_vs_projected.projected_savings[i] ?? 0;
              return (
                <div key={p} className="bs-chart-col">
                  <div className="bs-chart-bars-inner">
                    <div
                      className="bs-bar bs-bar-realized"
                      style={{ height: `${(r / maxBar) * 100}%` }}
                      title={formatMoneyInr(r)}
                    />
                    <div
                      className="bs-bar bs-bar-projected"
                      style={{ height: `${(pr / maxBar) * 100}%` }}
                      title={formatMoneyInr(pr)}
                    />
                  </div>
                  <span className="bs-chart-label">{p}</span>
                </div>
              );
            })}
          </div>
          <div className="bs-chart-legend">
            <span>
              <i className="bs-legend-dot bs-legend-realized" /> Realized
            </span>
            <span>
              <i className="bs-legend-dot bs-legend-projected" /> Projected
            </span>
          </div>
        </SectionCard>

        <SectionCard title="Approval / execution funnel" subtitle="Action pipeline volume">
          <div className="bs-funnel">
            <div className="bs-funnel-row">
              <span>Pending approval</span>
              <strong>{funnel.pending_approval}</strong>
            </div>
            <div className="bs-funnel-row">
              <span>Approved</span>
              <strong>{funnel.approved}</strong>
            </div>
            <div className="bs-funnel-row">
              <span>Rejected</span>
              <strong>{funnel.rejected}</strong>
            </div>
            <div className="bs-funnel-row">
              <span>Executed</span>
              <strong>{funnel.executed}</strong>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="split-grid">
        <SectionCard title="Top vendors by risk" subtitle="Projected financial exposure">
          <div className="bs-table-simple">
            {d.top_vendors_by_risk.map((v) => (
              <div key={v.vendor} className="bs-table-row">
                <span>{v.vendor}</span>
                <span className="bs-muted">{formatMoneyInr(v.projected_impact)}</span>
                <span className="badge badge-default">{(v.risk_score * 100).toFixed(0)}% risk</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Top teams by overload" subtitle="Open items and SLA breach risk">
          <div className="bs-table-simple">
            {d.top_teams_by_overload.map((t) => (
              <div key={t.team} className="bs-table-row">
                <span>{t.team}</span>
                <span className="bs-muted">{t.open_items} open</span>
                <span className={`badge badge-${t.sla_breach_risk === "high" ? "critical" : t.sla_breach_risk === "medium" ? "high" : "default"}`}>
                  {t.sla_breach_risk}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Recent high-risk cases" subtitle="Latest ranked issues" flush>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Module</th>
                <th>Severity</th>
                <th>Impact</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.recent_cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="td-main">{c.title}</div>
                    <div className="td-sub">{c.summary}</div>
                  </td>
                  <td>{formatModuleLabel(c.module)}</td>
                  <td>
                    <span className={`badge badge-${c.severity}`}>{c.severity}</span>
                  </td>
                  <td>{formatMoneyInr(c.projected_impact)}</td>
                  <td>
                    <NavLink to={`/cases?case=${encodeURIComponent(c.id)}`} className="btn btn-ghost btn-sm">
                      Open
                    </NavLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
