import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { SectionCard } from "../components/shared/SectionCard";
import { StatCard } from "../components/shared/StatCard";
import type {
  DashboardRenderMetric,
  DashboardRenderView,
  DashboardRenderWidget,
  ImpactMetric,
  ImpactOverview,
} from "../domain/business-sentry";
import { demoImpactOverview } from "../demo/businessSentryHardcoded";
import { useDashboardRender, useImpactOverview } from "../hooks/useBusinessSentry";
import { formatMoneyInr, formatModuleLabel } from "../lib/formatters";

type ImpactPageProps = {
  organizationId?: number;
};

type StatTone = "positive" | "negative" | "neutral";
type DashboardTone = "positive" | "negative" | "neutral" | "accent";

const CHART_COLORS = [
  "var(--dashboard-accent-strong)",
  "var(--dashboard-accent)",
  "var(--dashboard-accent-soft)",
  "var(--dashboard-ink-soft)",
  "rgba(255,255,255,0.34)",
];

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

function formatDashboardValue(value: number, valueFormat: string) {
  if (valueFormat === "currency") return formatMoneyInr(value);
  if (valueFormat === "percent") return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
  return Math.round(value).toLocaleString("en-IN");
}

function formatDashboardCell(value: unknown, valueFormat: string) {
  if (typeof value === "number") {
    return formatDashboardValue(value, valueFormat);
  }
  return String(value ?? "—");
}

function dashboardToneClass(tone: string): DashboardTone {
  if (tone === "positive" || tone === "negative" || tone === "accent") return tone;
  return "neutral";
}

function chartLabel(item: Record<string, unknown>, index: number) {
  return String(
    item.label ??
      item.name ??
      item.module ??
      item.validation_status ??
      item.detector ??
      `Item ${index + 1}`,
  );
}

function chartValue(item: Record<string, unknown>) {
  const raw =
    item.value ??
    item.latest_row_count ??
    item.schedule_minutes ??
    item.row_count ??
    item.count ??
    0;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}

function chartNote(item: Record<string, unknown>, label: string) {
  if (item.name && String(item.name) !== label) return String(item.name);
  if (item.module) return String(item.module);
  if (item.validation_status) return String(item.validation_status);
  if (item.detector) return String(item.detector);
  return "";
}

function normalizedChartItems(widget: DashboardRenderWidget) {
  return widget.items
    .map((item, index) => ({
      label: chartLabel(item, index),
      value: chartValue(item),
      note: chartNote(item, chartLabel(item, index)),
    }))
    .filter((item) => item.label);
}

function renderBarChart(widget: DashboardRenderWidget) {
  const items = normalizedChartItems(widget).slice(0, 6);
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="generated-chart-bar">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="generated-chart-bar-column">
          <div className="generated-chart-bar-track">
            <div
              className="generated-chart-bar-fill"
              style={{
                height: `${Math.max((item.value / maxValue) * 100, item.value > 0 ? 10 : 0)}%`,
                background: CHART_COLORS[index % CHART_COLORS.length],
              }}
              title={`${item.label}: ${formatDashboardValue(item.value, widget.value_format)}`}
            />
          </div>
          <div className="generated-chart-bar-value">
            {formatDashboardValue(item.value, widget.value_format)}
          </div>
          <div className="generated-chart-bar-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function renderLineChart(widget: DashboardRenderWidget) {
  const items = normalizedChartItems(widget).slice(0, 8);
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const points = items
    .map((item, index) => {
      const x = items.length === 1 ? 180 : (index / (items.length - 1)) * 360;
      const y = 140 - (item.value / maxValue) * 110;
      return `${x},${Number.isFinite(y) ? y : 140}`;
    })
    .join(" ");
  return (
    <div className="generated-chart-line">
      <svg viewBox="0 0 360 160" className="generated-chart-line-svg" preserveAspectRatio="none">
        <path d="M0 140 H360" className="generated-chart-axis" />
        <polyline points={points} className="generated-chart-line-path" />
        {items.map((item, index) => {
          const x = items.length === 1 ? 180 : (index / (items.length - 1)) * 360;
          const y = 140 - (item.value / maxValue) * 110;
          return <circle key={`${item.label}-${index}`} cx={x} cy={y} r="5" className="generated-chart-line-dot" />;
        })}
      </svg>
      <div className="generated-chart-line-labels">
        {items.map((item) => (
          <div key={item.label} className="generated-chart-line-label">
            <span>{item.label}</span>
            <strong>{formatDashboardValue(item.value, widget.value_format)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderPieChart(widget: DashboardRenderWidget) {
  const items = normalizedChartItems(widget).slice(0, 5);
  const total = Math.max(sum(items.map((item) => item.value)), 1);
  let cursor = 0;
  const segments = items.map((item, index) => {
    const span = (item.value / total) * 100;
    const start = cursor;
    cursor += span;
    return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${cursor}%`;
  });
  return (
    <div className="generated-chart-pie">
      <div
        className="generated-chart-pie-visual"
        style={{ backgroundImage: `conic-gradient(${segments.join(", ")})` }}
      >
        <div className="generated-chart-pie-hole">
          <strong>{formatDashboardValue(total, widget.value_format)}</strong>
          <span>Total</span>
        </div>
      </div>
      <div className="generated-chart-pie-legend">
        {items.map((item, index) => (
          <div key={item.label} className="generated-chart-pie-row">
            <span className="generated-chart-pie-key">
              <i
                className="generated-chart-pie-swatch"
                style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
              />
              {item.label}
            </span>
            <strong>{formatDashboardValue(item.value, widget.value_format)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderGeneratedWidget(widget: DashboardRenderWidget) {
  if (widget.kind === "chart" && widget.items.length) {
    if (widget.chart_type === "pie") return renderPieChart(widget);
    if (widget.chart_type === "line") return renderLineChart(widget);
    return renderBarChart(widget);
  }

  if (widget.rows.length) {
    const headers = Object.keys(widget.rows[0] ?? {});
    return (
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {widget.rows.map((row, index) => (
              <tr key={index}>
                {headers.map((header) => (
                  <td key={header}>{formatDashboardCell(row[header], widget.value_format)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (widget.items.length) {
    return (
      <div className="generated-list">
        {widget.items.map((item, index) => {
          const label = chartLabel(item, index);
          const note = chartNote(item, label);
          const value = item.value ?? item.latest_row_count ?? item.schedule_minutes ?? item.validation_status ?? "";
          return (
            <div key={`${label}-${index}`} className="generated-list-row">
              <div>
                <div className="generated-list-label">{label}</div>
                {note ? <div className="generated-list-note">{note}</div> : null}
              </div>
              <strong>{formatDashboardCell(value, widget.value_format)}</strong>
            </div>
          );
        })}
      </div>
    );
  }

  return <div className="generated-empty">{widget.empty_copy}</div>;
}

function buildDashboardViews(dashboardRender: NonNullable<ReturnType<typeof useDashboardRender>["data"]>) {
  if (dashboardRender.dashboards.length) return dashboardRender.dashboards;
  return [
    {
      key: "overview",
      title: dashboardRender.title,
      subtitle: dashboardRender.subtitle,
      layout: "grid",
      metrics: dashboardRender.metrics,
      widgets: dashboardRender.widgets,
    },
  ] satisfies DashboardRenderView[];
}

function generatedWidgetClass(widget: DashboardRenderWidget, layout: string) {
  const isTable = widget.kind === "table" || widget.rows.length > 0;
  const isWideChart = widget.kind === "chart" && (widget.chart_type === "line" || widget.items.length > 5);
  if (layout === "hero" && (isTable || isWideChart)) return "generated-widget generated-widget-wide";
  if (layout === "dense" && isTable) return "generated-widget generated-widget-wide";
  return "generated-widget";
}

function themeAccentVar(theme: string) {
  if (theme === "teal") return "var(--dashboard-accent, #4CC3A7)";
  if (theme === "amber") return "var(--dashboard-accent, #F59E0B)";
  return "var(--dashboard-accent, #2477D0)";
}

function themeAccentSoftVar(theme: string) {
  if (theme === "teal") return "var(--dashboard-accent-soft, rgba(76,195,167,0.18))";
  if (theme === "amber") return "var(--dashboard-accent-soft, rgba(245,158,11,0.15))";
  return "var(--dashboard-accent-soft, rgba(36,119,208,0.12))";
}

export function ImpactPage({ organizationId }: ImpactPageProps) {
  const dashboardRenderQuery = useDashboardRender(organizationId);
  const impactQuery = useImpactOverview(organizationId);
  const dashboardRender = dashboardRenderQuery.data;
  const hasGeneratedDashboard = Boolean(
    dashboardRender &&
      (dashboardRender.metrics.length > 0 ||
        dashboardRender.widgets.length > 0 ||
        dashboardRender.dashboards.length > 0 ||
        dashboardRender.title !== "No dashboard yet"),
  );

  const [activeTab, setActiveTab] = useState(0);

  if (hasGeneratedDashboard && dashboardRender) {
    const views = buildDashboardViews(dashboardRender);
    const current = views[activeTab] ?? views[0];
    const theme = dashboardRender.theme_preset ?? "cobalt";

    return (
      <div className={`page-content generated-dashboard generated-theme-${theme}`}>
        <PageHeader
          title={dashboardRender.title}
          subtitle={dashboardRender.subtitle}
          actions={
            <span
              className={`badge ${
                dashboardRenderQuery.isFetching && dashboardRenderQuery.data
                  ? "badge-blue"
                  : "badge-green"
              }`}
            >
              {dashboardRenderQuery.isFetching && dashboardRenderQuery.data
                ? "Refreshing generated dashboard"
                : "Generated dashboard"}
            </span>
          }
        />

        {views.length > 1 && (
          <nav className="generated-tabs" role="tablist">
            {views.map((view, index) => (
              <button
                key={view.key}
                role="tab"
                aria-selected={index === activeTab}
                className={`generated-tab ${index === activeTab ? "generated-tab-active" : ""}`}
                onClick={() => setActiveTab(index)}
                style={
                  index === activeTab
                    ? {
                        borderColor: themeAccentVar(theme),
                        color: themeAccentVar(theme),
                        background: themeAccentSoftVar(theme),
                      }
                    : undefined
                }
              >
                {view.title}
              </button>
            ))}
          </nav>
        )}

        {current.subtitle ? (
          <div className="generated-view-subtitle">{current.subtitle}</div>
        ) : null}

        {current.metrics.length > 0 && (
          <div className="generated-metric-strip">
            {current.metrics.map((metric, index) => (
              <div key={`${current.key}-m-${index}`} className="generated-metric-card">
                <span className="generated-metric-label">{metric.title}</span>
                <span className="generated-metric-value">
                  {formatDashboardValue(metric.value, metric.value_format)}
                </span>
                <span className={`generated-metric-tone generated-metric-tone-${dashboardToneClass(metric.tone)}`} />
              </div>
            ))}
          </div>
        )}

        <div className={`generated-widget-grid generated-widget-grid-${current.layout ?? "grid"}`}>
          {current.widgets.map((widget, index) => (
            <div
              key={`${current.key}-w-${index}`}
              className={generatedWidgetClass(widget, current.layout ?? "grid")}
            >
              <div className="generated-widget-header">
                <div>
                  <div className="generated-widget-title">{widget.title}</div>
                  {widget.subtitle ? (
                    <div className="generated-widget-subtitle">{widget.subtitle}</div>
                  ) : null}
                </div>
              </div>
              <div className="generated-widget-body">{renderGeneratedWidget(widget)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

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
