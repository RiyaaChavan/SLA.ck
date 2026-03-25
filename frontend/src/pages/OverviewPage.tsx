import type { DashboardOverview } from "../types/api";
import { SectionCard } from "../components/shared/SectionCard";
import { StatCard } from "../components/shared/StatCard";
import { AlertTable } from "../components/dashboard/AlertTable";

type OverviewPageProps = {
  data?: DashboardOverview;
  onApprove: (recommendationId: number) => void;
  onExecute: (actionId: number) => void;
};

function getBarClass(pct: number) {
  if (pct >= 85) return "hot";
  if (pct >= 65) return "warm";
  return "";
}

export function OverviewPage({ data, onApprove, onExecute }: OverviewPageProps) {
  if (!data) {
    return (
      <div className="page-content">
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <h3>No data yet</h3>
            <p>Bootstrap the enterprise dataset from the sidebar to unlock your cost intelligence dashboard.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Hero banner */}
      <div className="hero-panel">
        <div className="hero-eyebrow">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="5" />
          </svg>
          Cost Command Center
        </div>
        <div className="hero-title">{data.organization.name}</div>
        <div className="hero-desc">
          Enterprise-grade monitoring for leakage, SLA risk, vendor discrepancies, and resource
          utilization across {data.organization.industry.toLowerCase()} workflows.
        </div>
      </div>

      {/* Stat metric cards */}
      <div className="stat-grid">
        {data.metrics.map((metric) => (
          <StatCard
            key={metric.label}
            label={metric.label}
            value={
              metric.label.toLowerCase().includes("alert")
                ? String(metric.value)
                : `₹${Math.round(metric.value).toLocaleString()}`
            }
            delta={metric.delta ? `${metric.delta > 0 ? "+" : ""}${metric.delta}%` : undefined}
          />
        ))}
      </div>

      {/* Alert Mix + Resource Heatmap */}
      <div className="split-grid">
        <SectionCard
          title="Alert Mix"
          subtitle="Distribution of active exposure across issue classes"
        >
          <div className="mix-grid">
            {data.alert_mix.map((item) => (
              <div key={item.label} className="mix-tile">
                <div className="mix-tile-label">{item.label.replaceAll("_", " ")}</div>
                <div className="mix-tile-value">{item.value}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Resource Heatmap"
          subtitle="Most expensive resources sorted by utilization"
        >
          <div className="resource-heatmap">
            {data.resource_heatmap.map((resource) => (
              <div key={resource.resource_name} className="resource-heatmap-row">
                <div>
                  <div className="resource-heatmap-name">{resource.resource_name}</div>
                  <div className="resource-heatmap-type">{resource.resource_type}</div>
                </div>
                <div className="resource-bar">
                  <div
                    className={`resource-bar-fill ${getBarClass(resource.utilization_pct)}`}
                    style={{ width: `${Math.min(resource.utilization_pct, 100)}%` }}
                  />
                </div>
                <div className="resource-pct">{resource.utilization_pct.toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Alerts table */}
      <SectionCard
        title="Highest Exposure Alerts"
        subtitle="Approve recommendations and execute remediation actions directly from this queue"
        flush
      >
        <AlertTable
          alerts={data.top_alerts}
          onApprove={(alert) => alert.recommendation_id && onApprove(alert.recommendation_id)}
          onExecute={(alert) => alert.action_id && onExecute(alert.action_id)}
        />
      </SectionCard>
    </div>
  );
}
