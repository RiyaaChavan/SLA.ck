import { NavLink } from "react-router-dom";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { SectionCard } from "../components/shared/SectionCard";
import { StatCard } from "../components/shared/StatCard";
import type { ImpactMetric, ImpactOverview } from "../domain/business-sentry";
import { demoImpactOverview } from "../demo/businessSentryHardcoded";
import { useImpactOverview } from "../hooks/useBusinessSentry";
import { formatMoneyInr, formatModuleLabel } from "../lib/formatters";

type ImpactPageProps = {
  organizationId?: number;
};

type StatTone = "positive" | "negative" | "neutral";

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function hasKeyword(label: string, keywords: string[]) {
  const lowered = label.toLowerCase();
  return keywords.some((keyword) => lowered.includes(keyword));
}

function findMetric(metrics: ImpactMetric[], keywords: string[]) {
  return metrics.find((metric) => hasKeyword(metric.label, keywords)) ?? null;
}

function formatMetricValue(metric: ImpactMetric | null, fallback = 0) {
  const label = metric?.label.toLowerCase() ?? "";
  const value = metric?.value ?? fallback;
  const countKeywords = ["case", "alert", "anomal", "action", "queue", "item"];
  return countKeywords.some((keyword) => label.includes(keyword))
    ? Math.round(value).toLocaleString("en-IN")
    : formatMoneyInr(value);
}

function riskBadgeClass(score: number) {
  if (score >= 0.85) return "badge-critical";
  if (score >= 0.65) return "badge-high";
  if (score >= 0.45) return "badge-medium";
  return "badge-low";
}

function pressureBadgeClass(level: string) {
  if (level === "critical") return "badge-critical";
  if (level === "high") return "badge-high";
  if (level === "medium") return "badge-medium";
  return "badge-low";
}

export function ImpactPage({ organizationId }: ImpactPageProps) {
  const impactQuery = useImpactOverview(organizationId);
  const d: ImpactOverview = impactQuery.data ?? demoImpactOverview;
  const usingFallback = !impactQuery.data;
  const leakageMetric =
    findMetric(d.metrics, ["leakage", "risk", "money at risk", "projected exposure"]) ??
    d.metrics[0] ??
    null;
  const penaltyMetric =
    findMetric(d.metrics, ["penalty", "sla exposure", "exposure"]) ?? d.metrics[1] ?? null;
  const openMetric =
    findMetric(d.metrics, ["open", "critical", "high-risk", "anomal", "alert", "case"]) ??
    d.metrics[2] ??
    null;

  const projectedTotal = sum(d.realized_vs_projected.projected_savings);
  const realizedTotal = sum(d.realized_vs_projected.realized_savings);
  const captureRate =
    d.realized_vs_projected.capture_rate_pct ??
    (projectedTotal > 0 ? (realizedTotal / projectedTotal) * 100 : 0);
  const maxBar = Math.max(
    ...d.realized_vs_projected.realized_savings,
    ...d.realized_vs_projected.projected_savings,
    1,
  );
  const hasTrendSeries = d.realized_vs_projected.periods.length > 1;
  const funnel = d.approval_execution_funnel;
  const funnelRows = [
    { label: "Pending approval", value: funnel.pending_approval, tone: "negative" as const },
    { label: "Approved", value: funnel.approved, tone: "positive" as const },
    { label: "Rejected", value: funnel.rejected, tone: "neutral" as const },
    { label: "Executed", value: funnel.executed, tone: "positive" as const },
  ];
  const funnelTotal = Math.max(sum(funnelRows.map((row) => row.value)), 1);
  const vendorMax = Math.max(...d.top_vendors_by_risk.map((row) => row.projected_impact), 1);
  const teamMax = Math.max(...d.top_teams_by_overload.map((row) => row.open_items), 1);
  const statCards: Array<{
    label: string;
    value: string;
    detail: string;
    detailTone: StatTone;
  }> = [
    {
      label: leakageMetric?.label ?? "Projected leakage",
      value: formatMetricValue(leakageMetric),
      detail: "Value currently tied up in unresolved anomaly cases",
      detailTone: "negative",
    },
    {
      label: penaltyMetric?.label ?? "SLA penalty exposure",
      value: formatMetricValue(penaltyMetric),
      detail: "Active SLA-linked risk still sitting in the queue",
      detailTone: "negative",
    },
    {
      label: openMetric?.label ?? "Open critical anomalies",
      value: formatMetricValue(openMetric),
      detail: "Signals that still need an owner, approval, or containment action",
      detailTone: "neutral",
    },
    {
      label: "Recovery capture rate",
      value: `${captureRate.toFixed(0)}%`,
      detail: `${formatMoneyInr(realizedTotal)} recovered against ${formatMoneyInr(projectedTotal)} projected`,
      detailTone: captureRate >= 60 ? "positive" : captureRate >= 40 ? "neutral" : "negative",
    },
  ];

  return (
    <div className="page-content">
      <PageHeader
        title="Anomalies"
        subtitle={`Operational anomaly dashboard for ${d.organization.name}. Focus on where money, SLA pressure, and approvals are concentrating right now.`}
        actions={
          <span
            className={`badge ${
              impactQuery.isFetching && impactQuery.data
                ? "badge-blue"
                : usingFallback
                  ? "badge-medium"
                  : "badge-green"
            }`}
          >
            {impactQuery.isFetching && impactQuery.data
              ? "Refreshing live snapshot"
              : usingFallback
                ? organizationId
                  ? "Demo fallback"
                  : "Seed a workspace"
                : "Live impact snapshot"}
          </span>
        }
      />

      <div className="stat-grid">
        {statCards.map((card, index) => {
          const accentClass =
            index === 0
              ? "stat-card-red"
              : index === 1
                ? "stat-card-amber"
                : index === 2
                  ? "stat-card-blue"
                  : "stat-card-teal";
          return (
            <div key={card.label} className={accentClass} style={{ borderRadius: "var(--radius-lg)" }}>
              <StatCard
                label={card.label}
                value={card.value}
                detail={card.detail}
                detailTone={card.detailTone}
              />
            </div>
          );
        })}
      </div>

      <div className="split-grid">
        <SectionCard
          title="Recovery vs projected value"
          subtitle={
            hasTrendSeries
              ? "Only periods the feed can support are shown here."
              : "The current backend feed exposes a single aggregate snapshot."
          }
          className="section-card-cobalt"
          action={<span className="badge badge-green">{captureRate.toFixed(0)}% capture</span>}
        >
          {hasTrendSeries ? (
            <>
              <div className="bs-chart-bars">
                {d.realized_vs_projected.periods.map((period, index) => {
                  const realized = d.realized_vs_projected.realized_savings[index] ?? 0;
                  const projected = d.realized_vs_projected.projected_savings[index] ?? 0;
                  return (
                    <div key={period} className="bs-chart-col">
                      <div className="bs-chart-bars-inner">
                        <div
                          className="bs-bar bs-bar-realized"
                          style={{ height: `${(realized / maxBar) * 100}%` }}
                          title={`Recovered ${formatMoneyInr(realized)}`}
                        />
                        <div
                          className="bs-bar bs-bar-projected"
                          style={{ height: `${(projected / maxBar) * 100}%` }}
                          title={`Projected ${formatMoneyInr(projected)}`}
                        />
                      </div>
                      <span className="bs-chart-label">{period}</span>
                    </div>
                  );
                })}
              </div>
              <div className="bs-chart-legend">
                <span>
                  <i className="bs-legend-dot bs-legend-realized" /> Recovered
                </span>
                <span>
                  <i className="bs-legend-dot bs-legend-projected" /> Projected
                </span>
              </div>
            </>
          ) : (
            <div className="bs-capture-panel">
              <div className="bs-capture-summary">
                <div className="bs-capture-stat">
                  <span>Projected savings</span>
                  <strong>{formatMoneyInr(projectedTotal)}</strong>
                </div>
                <div className="bs-capture-stat">
                  <span>Recovered</span>
                  <strong>{formatMoneyInr(realizedTotal)}</strong>
                </div>
              </div>
              <div className="bs-ranked-track bs-ranked-track-tight">
                <div
                  className="bs-ranked-fill bs-ranked-fill-cobalt"
                  style={{ width: `${Math.min(captureRate, 100)}%` }}
                />
              </div>
              <div className="bs-capture-scale">
                <span>0%</span>
                <span>{captureRate.toFixed(0)}% captured</span>
                <span>100%</span>
              </div>
              <div className="bs-footnote">
                The chart stays in snapshot mode until the backend sends a real time series.
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Action pipeline"
          subtitle="How signals are moving from approval into execution."
          className="section-card-teal"
        >
          <div className="bs-pipeline-list">
            {funnelRows.map((row) => {
              const share = row.value > 0 ? (row.value / funnelTotal) * 100 : 0;
              return (
                <div key={row.label} className="bs-pipeline-row">
                  <div className="bs-pipeline-head">
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                  <div className="bs-ranked-track bs-ranked-track-tight">
                    <div
                      className={`bs-ranked-fill bs-ranked-fill-${row.tone}`}
                      style={{ width: `${Math.max(row.value > 0 ? share : 0, row.value > 0 ? 8 : 0)}%` }}
                    />
                  </div>
                  <div className="bs-pipeline-meta">{share.toFixed(0)}% of the active action pipeline</div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <div className="split-grid">
        <SectionCard
          title="Vendor exposure concentration"
          subtitle="Projected impact aggregated by vendor."
          className="section-card-amber"
        >
          <div className="bs-ranked-list">
            {d.top_vendors_by_risk.map((vendor) => (
              <div key={vendor.vendor} className="bs-ranked-row">
                <div className="bs-ranked-head">
                  <strong>{vendor.vendor}</strong>
                  <span>{formatMoneyInr(vendor.projected_impact)}</span>
                </div>
                <div className="bs-ranked-track">
                  <div
                    className="bs-ranked-fill bs-ranked-fill-amber"
                    style={{ width: `${(vendor.projected_impact / vendorMax) * 100}%` }}
                  />
                </div>
                <div className="bs-ranked-meta">
                  <span>{(vendor.risk_score * 100).toFixed(0)}% relative risk score</span>
                  <span className={`badge ${riskBadgeClass(vendor.risk_score)}`}>
                    {(vendor.risk_score * 100).toFixed(0)}% risk
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Operational hotspots"
          subtitle="Teams carrying the heaviest live queue pressure."
          className="section-card-red"
        >
          <div className="bs-ranked-list">
            {d.top_teams_by_overload.map((team) => (
              <div key={team.team} className="bs-ranked-row">
                <div className="bs-ranked-head">
                  <strong>{team.team}</strong>
                  <span>{team.open_items} open items</span>
                </div>
                <div className="bs-ranked-track">
                  <div
                    className={`bs-ranked-fill bs-ranked-fill-${team.sla_breach_risk === "high" ? "negative" : team.sla_breach_risk === "medium" ? "amber" : "positive"}`}
                    style={{ width: `${(team.open_items / teamMax) * 100}%` }}
                  />
                </div>
                <div className="bs-ranked-meta">
                  <span>{team.open_items} active items in the current queue</span>
                  <span className={`badge ${pressureBadgeClass(team.sla_breach_risk)}`}>
                    {team.sla_breach_risk} pressure
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Recent high-risk cases" subtitle="Latest ranked anomalies with an immediate action path." flush>
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

      {usingFallback ? (
        <div className="bs-footnote">
          Showing fallback dashboard content because a live organization snapshot is not available yet.
        </div>
      ) : null}
    </div>
  );
}
