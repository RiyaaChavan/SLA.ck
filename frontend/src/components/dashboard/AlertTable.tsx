import type { Alert } from "../../types/api";

type AlertTableProps = {
  alerts: Alert[];
  onApprove?: (alert: Alert) => void;
  onExecute?: (alert: Alert) => void;
};

export function AlertTable({ alerts, onApprove, onExecute }: AlertTableProps) {
  if (!alerts.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <h3>No alerts found</h3>
        <p>All systems look healthy. Run a rescan to check for new cost anomalies.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Alert</th>
            <th>Type</th>
            <th>Severity</th>
            <th>Impact</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
            <tr key={alert.id}>
              <td>
                <div className="td-main">{alert.title}</div>
                <div className="td-sub">{alert.description}</div>
              </td>
              <td>
                <span style={{ fontSize: "13px", color: "var(--text-2)", textTransform: "capitalize" }}>
                  {alert.type.replaceAll("_", " ")}
                </span>
              </td>
              <td>
                <span className={`badge badge-${alert.severity}`}>{alert.severity}</span>
              </td>
              <td>
                <span style={{ fontWeight: 600, fontSize: "13.5px" }}>
                  ₹{Math.round(alert.projected_impact).toLocaleString()}
                </span>
              </td>
              <td>
                <span className="badge badge-default" style={{ textTransform: "capitalize" }}>
                  {alert.status}
                </span>
              </td>
              <td>
                <div className="td-actions">
                  {alert.recommendation_id ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => onApprove?.(alert)}>
                      Approve
                    </button>
                  ) : null}
                  {alert.action_id ? (
                    <button className="btn btn-ghost-danger btn-sm" onClick={() => onExecute?.(alert)}>
                      Execute
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
