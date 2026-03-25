import type { Alert } from "../types/api";
import { AlertTable } from "../components/dashboard/AlertTable";

type AlertsPageProps = {
  alerts: Alert[];
  onRescan: () => void;
  onApprove: (recommendationId: number) => void;
  onExecute: (actionId: number) => void;
};

export function AlertsPage({ alerts, onRescan, onApprove, onExecute }: AlertsPageProps) {
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const medium = alerts.filter((a) => a.severity === "medium" || a.severity === "high").length;

  return (
    <div className="page-content">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Operational Alert Queue</div>
          <div className="page-subtitle">
            Unified view of leakage, SLA, vendor, and utilization incidents
            {alerts.length > 0 && (
              <> &mdash; <strong>{alerts.length}</strong> active
                {critical > 0 && <>, <span style={{ color: "var(--red)" }}>{critical} critical</span></>}
                {medium > 0 && <>, <span style={{ color: "var(--amber)" }}>{medium} medium</span></>}
              </>
            )}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={onRescan}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Rescan Alerts
          </button>
        </div>
      </div>

      {/* Alert table card */}
      <div className="card">
        <AlertTable
          alerts={alerts}
          onApprove={(alert) => alert.recommendation_id && onApprove(alert.recommendation_id)}
          onExecute={(alert) => alert.action_id && onExecute(alert.action_id)}
        />
      </div>
    </div>
  );
}
