import type { AuditItem } from "../types/api";

type AuditPageProps = {
  feed: AuditItem[];
  reports: Array<{ id: number; title: string; status: string; storage_path?: string | null }>;
  onGenerateReport: () => void;
};

export function AuditPage({ feed, reports, onGenerateReport }: AuditPageProps) {
  return (
    <div className="page-content">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Audit & Reports</div>
          <div className="page-subtitle">
            Every alert, approval, action, and report is immutably logged for compliance review
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={onGenerateReport}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            Generate Report
          </button>
        </div>
      </div>

      <div className="split-grid">
        {/* Audit Trail */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Audit Trail</div>
              <div className="card-subtitle">{feed.length} events logged</div>
            </div>
          </div>
          <div className="card-body">
            {feed.length === 0 ? (
              <div className="empty-state" style={{ padding: "40px 0" }}>
                <div className="empty-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <h3>No events yet</h3>
                <p>Activity will appear here after bootstrapping data.</p>
              </div>
            ) : (
              <div className="timeline">
                {feed.map((item) => (
                  <div key={item.id} className="timeline-item">
                    <div className="timeline-entity">{item.entity_type}</div>
                    <div className="timeline-event">{item.event_type}</div>
                    <div className="timeline-time">
                      {new Date(item.created_at).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Executive Reports */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Executive Reports</div>
              <div className="card-subtitle">
                PDF-ready summaries for finance, procurement, and audit review
              </div>
            </div>
            {reports.length > 0 && (
              <span className="badge badge-default">{reports.length}</span>
            )}
          </div>
          <div className="card-body">
            {reports.length === 0 ? (
              <div className="empty-state" style={{ padding: "40px 0" }}>
                <div className="empty-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <h3>No reports generated</h3>
                <p>Click "Generate Report" to create an executive summary.</p>
              </div>
            ) : (
              <div className="report-list">
                {reports.map((report) => (
                  <div key={report.id} className="report-card">
                    <div className={`report-status ${report.status.toLowerCase()}`}>
                      {report.status}
                    </div>
                    <div className="report-title">{report.title}</div>
                    <div className="report-path">
                      {report.storage_path ?? "PDF storage path pending"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
