import { NavLink } from "react-router-dom";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { SectionCard } from "../components/shared/SectionCard";
import { StatCard } from "../components/shared/StatCard";
import { demoAnomalyHits, demoAnomalyQueries, demoImpactOverview } from "../demo/businessSentryHardcoded";
import { formatMoneyInr, formatModuleLabel } from "../lib/formatters";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-sql";
import "prismjs/themes/prism-tomorrow.css";

type ImpactPageProps = {
  organizationId?: number;
};

export function ImpactPage(_: ImpactPageProps) {
  const d = demoImpactOverview;
  const funnel = d.approval_execution_funnel;
  const maxBar = Math.max(
    ...d.realized_vs_projected.realized_savings.map((v, i) =>
      Math.max(v, d.realized_vs_projected.projected_savings[i] ?? 0),
    ),
    1,
  );

  return (
    <div className="page-content">
      <PageHeader
        title="Anomalies"
        subtitle={`Live anomaly dashboard for ${d.organization.name} — financial leakage, SLA exposure, and action-ready cases.`}
      />

      <div className="stat-grid">
        {d.metrics.map((m, i) => {
          const accentCls = i === 0 ? "stat-card-red" : i === 1 ? "stat-card-amber" : i === 2 ? "stat-card-teal" : "stat-card-blue";
          return (
            <div key={m.label} className={accentCls} style={{ borderRadius: "var(--radius-lg)" }}>
              <StatCard
                label={m.label}
                value={
                  m.label.toLowerCase().includes("anomal") || m.label.toLowerCase().includes("action")
                    ? String(Math.round(m.value))
                    : formatMoneyInr(m.value)
                }
                delta={m.delta != null ? `${m.delta > 0 ? "+" : ""}${m.delta}%` : undefined}
              />
            </div>
          );
        })}
      </div>

      <div className="split-grid">
        <SectionCard title="Realized vs projected savings" subtitle="Weekly recovery trend" className="section-card-cobalt">
          <div className="bs-chart-bars">
            {d.realized_vs_projected.periods.map((p, i) => {
              const realized = d.realized_vs_projected.realized_savings[i] ?? 0;
              const projected = d.realized_vs_projected.projected_savings[i] ?? 0;
              return (
                <div key={p} className="bs-chart-col">
                  <div className="bs-chart-bars-inner">
                    <div
                      className="bs-bar bs-bar-realized"
                      style={{ height: `${(realized / maxBar) * 100}%` }}
                      title={formatMoneyInr(realized)}
                    />
                    <div
                      className="bs-bar bs-bar-projected"
                      style={{ height: `${(projected / maxBar) * 100}%` }}
                      title={formatMoneyInr(projected)}
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

        <SectionCard title="Approval / execution funnel" subtitle="Current action pipeline" className="section-card-teal">
          <div className="bs-funnel">
            <div className="bs-funnel-row bs-funnel-row-pending">
              <span>Pending approval</span><strong>{funnel.pending_approval}</strong>
            </div>
            <div className="bs-funnel-row bs-funnel-row-approved">
              <span>Approved</span><strong>{funnel.approved}</strong>
            </div>
            <div className="bs-funnel-row bs-funnel-row-rejected">
              <span>Rejected</span><strong>{funnel.rejected}</strong>
            </div>
            <div className="bs-funnel-row bs-funnel-row-executed">
              <span>Executed</span><strong>{funnel.executed}</strong>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="split-grid">
        <SectionCard title="Top vendors by risk" subtitle="Projected financial exposure" className="section-card-amber">
          <div className="bs-table-simple">
            {d.top_vendors_by_risk.map((v) => (
              <div key={v.vendor} className="bs-table-row">
                <span>{v.vendor}</span>
                <span className="bs-muted">{formatMoneyInr(v.projected_impact)}</span>
                <span className={`badge ${v.risk_score > 0.6 ? "badge-critical" : v.risk_score > 0.4 ? "badge-high" : "badge-default"}`}>
                  {(v.risk_score * 100).toFixed(0)}% risk
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Top teams by overload" subtitle="Open items and breach pressure" className="section-card-red">
          <div className="bs-table-simple">
            {d.top_teams_by_overload.map((t) => (
              <div key={t.team} className="bs-table-row">
                <span>{t.team}</span>
                <span className="bs-muted">{t.open_items} open</span>
                <span
                  className={`badge badge-${
                    t.sla_breach_risk === "high" ? "critical" : t.sla_breach_risk === "medium" ? "high" : "default"
                  }`}
                >
                  {t.sla_breach_risk}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Detector hits" subtitle="Live anomaly tiles driven by the saved preset SQL">
        <div className="bs-query-list">
          {demoAnomalyHits.map((hit) => {
            const sourceQuery = demoAnomalyQueries.find((query) => query.id === hit.queryId);
            return (
              <div key={hit.queryId} className="bs-query-card">
                <div className="bs-query-head">
                  <strong>{sourceQuery?.name ?? hit.title}</strong>
                  <span className="badge badge-critical">{hit.triggeredCases} hits</span>
                </div>
                <div className="card-subtitle">{hit.title}</div>
                <div className="bs-inline-meta" style={{ marginTop: 10 }}>
                  <span className="bs-pill">{hit.owner}</span>
                  <span className="bs-pill">{formatMoneyInr(hit.impactInr)} at risk</span>
                  <span className="bs-pill">{sourceQuery?.category ?? "detector"}</span>
                </div>
                {sourceQuery ? (
                  <div className="bg-[#050810] border border-white/5 rounded-md overflow-hidden mt-3">
                    <Editor
                      value={sourceQuery.sql_text}
                      onValueChange={() => {}}
                      highlight={(code) => Prism.highlight(code, Prism.languages.sql, "sql")}
                      padding={16}
                      disabled
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: 12.5,
                        backgroundColor: "transparent",
                        lineHeight: "1.6",
                      }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Recent high-risk cases" subtitle="Latest ranked anomalies" flush>
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
