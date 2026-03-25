import type { ResourceOverview } from "../types/api";

type ResourcesPageProps = {
  data?: ResourceOverview;
};

function getBarClass(pct: number) {
  if (pct >= 85) return "hot";
  if (pct >= 65) return "warm";
  return "";
}

export function ResourcesPage({ data }: ResourcesPageProps) {
  if (!data) {
    return (
      <div className="page-content">
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
              </svg>
            </div>
            <h3>No resource data yet</h3>
            <p>Bootstrap the enterprise dataset to view resource utilization across teams and infrastructure.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Resource Optimization Grid</div>
          <div className="page-subtitle">
            Utilization across teams, tools, and infrastructure — {data.rows.length} resources tracked
          </div>
        </div>
      </div>

      {/* Resource cards grid */}
      <div className="resource-cards-grid">
        {data.rows.map((row) => (
          <div className="resource-card" key={`${row.department_id}-${row.resource_name}`}>
            <div className="resource-card-type">{row.resource_type.replaceAll("_", " ")}</div>
            <div className="resource-card-name">{row.resource_name}</div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: "var(--text-2)" }}>
                <span>Utilization</span>
                <span style={{ fontWeight: 600, color: "var(--text-1)" }}>
                  {row.utilization_pct.toFixed(1)}%
                </span>
              </div>
              <div className="resource-bar">
                <div
                  className={`resource-bar-fill ${getBarClass(row.utilization_pct)}`}
                  style={{ width: `${Math.min(row.utilization_pct, 100)}%` }}
                />
              </div>
            </div>

            <div className="resource-card-metrics">
              <div className="resource-card-metric-row">
                <span>Active / Provisioned</span>
                <span>
                  {row.active_units}
                  <span style={{ color: "var(--text-3)" }}> / {row.provisioned_units}</span>
                </span>
              </div>
              <div className="resource-card-metric-row">
                <span>Monthly cost</span>
                <span>₹{Math.round(row.monthly_cost).toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
