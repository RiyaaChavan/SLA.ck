import { useRef } from "react";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { formatDateTime } from "../lib/formatters";
import { useDataSourceUpload, useDataSources } from "../hooks/useBusinessSentry";

type DataSourcesPageProps = {
  organizationId?: number;
};

export function DataSourcesPage({ organizationId }: DataSourcesPageProps) {
  const q = useDataSources(organizationId);
  const upload = useDataSourceUpload(organizationId);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Select a workspace" />
      </div>
    );
  }

  const triggerUpload = () => fileRef.current?.click();

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) upload.mutate(f.name);
    e.target.value = "";
  };

  return (
    <div className="page-content">
      <PageHeader
        title="Connected data"
        subtitle="Connect your lake or uploads — we track freshness, schema, and health so agents know what’s new."
        actions={
          <>
            <input ref={fileRef} type="file" className="bs-file-input" onChange={onFile} aria-hidden />
            <button type="button" className="btn btn-secondary" onClick={triggerUpload} disabled={upload.isPending}>
              Upload file
            </button>
            <button type="button" className="btn btn-primary" onClick={() => upload.mutate("connector_stub.json")} disabled={upload.isPending}>
              Connect (stub)
            </button>
          </>
        }
      />

      {upload.isSuccess ? (
        <div className="bs-banner bs-banner-ok">
          {upload.data.message} (id: {upload.data.upload_id})
        </div>
      ) : null}

      {q.isPending ? (
        <StateBlock title="Loading data sources" loading />
      ) : q.isError || !q.data?.length ? (
        <StateBlock title="No data sources" description="Bootstrap the workspace or wait for backend seeding." />
      ) : (
        <div className="bs-source-grid">
          {q.data.map((s) => (
            <div key={s.id} className="card bs-source-card">
              <div className="card-header">
                <div>
                  <div className="card-title">{s.name}</div>
                  <div className="card-subtitle">
                    {s.source_type.replaceAll("_", " ")} · {s.record_count.toLocaleString()} records
                  </div>
                </div>
                <span className={`badge badge-${s.health === "ok" ? "default" : "high"}`}>{s.health}</span>
              </div>
              <div className="card-body">
                <div className="bs-source-meta">
                  <span>Status</span>
                  <strong>{s.status}</strong>
                  <span>Freshness</span>
                  <strong>{s.freshness_status}</strong>
                  <span>Last synced</span>
                  <strong>{formatDateTime(s.last_synced_at)}</strong>
                </div>
                <div className="bs-schema-preview">
                  <div className="td-sub">Schema preview</div>
                  <div className="bs-pill-row">
                    {s.schema_preview.map((col) => (
                      <span key={col} className="bs-pill">
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="bs-upload-history">
                  <div className="td-sub">Upload history</div>
                  <ul className="bs-list">
                    {s.upload_history.map((h, i) => (
                      <li key={i}>
                        {h.filename} — {h.rows.toLocaleString()} rows · {formatDateTime(h.at)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
