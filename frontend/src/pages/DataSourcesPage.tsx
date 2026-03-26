import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ConnectRelationalCard } from "../components/data-sources/ConnectRelationalCard";
import { DatasetListPanel } from "../components/data-sources/DatasetListPanel";
import { DatasetPreviewTable } from "../components/data-sources/DatasetPreviewTable";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { useNotifications } from "../components/shared/Notifications";
import { formatDateTime } from "../lib/formatters";
import { useDataSourceUpload, useDataSources } from "../hooks/useBusinessSentry";
import {
  demoAnomalyQueries,
  demoDatasetPreviews,
  demoDatasets,
  demoSourceCards,
  demoSourceMemory,
} from "../demo/businessSentryHardcoded";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-sql";
import "prismjs/themes/prism-tomorrow.css";

type DataSourcesPageProps = {
  organizationId?: number;
};

/* ── tiny inline SVG icons ── */
const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);
const IconDatabase = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
);
const IconBrain = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A5.5 5.5 0 0 0 4 7.5c0 1.13.34 2.18.93 3.06" /><path d="M14.5 2A5.5 5.5 0 0 1 20 7.5c0 1.13-.34 2.18-.93 3.06" /><path d="M4.93 10.56A5.5 5.5 0 0 0 7.5 21" /><path d="M19.07 10.56A5.5 5.5 0 0 1 16.5 21" /><path d="M12 2v19" /></svg>
);
const IconCode = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
);
const IconTable = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
);
const IconChevron = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "transform 200ms", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}><polyline points="6 9 12 15 18 9" /></svg>
);

function SectionHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="ds-section-heading">
      <div className="ds-section-icon">{icon}</div>
      <div>
        <div className="ds-section-title">{title}</div>
        <div className="ds-section-subtitle">{subtitle}</div>
      </div>
    </div>
  );
}

export function DataSourcesPage({ organizationId }: DataSourcesPageProps) {
  const { notify } = useNotifications();
  const q = useDataSources(organizationId);
  const upload = useDataSourceUpload(organizationId);
  const fileRef = useRef<HTMLInputElement>(null);
  const notesFileRef = useRef<HTMLInputElement>(null);

  const [databaseUrl, setDatabaseUrl] = useState("");
  const [schema, setSchema] = useState("");
  const [schemaNotes, setSchemaNotes] = useState("");
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [showConnectForm, setShowConnectForm] = useState(false);

  useEffect(() => {
    if (!selectedDataset && demoDatasets.length) {
      setSelectedDataset(demoDatasets[0].name);
    }
  }, [selectedDataset]);

  const preview = useMemo(
    () => (selectedDataset ? demoDatasetPreviews[selectedDataset] ?? null : null),
    [selectedDataset],
  );

  const apiSources = q.data ?? [];
  const isConnected = apiSources.length > 0;
  
  // Use API sources if available, otherwise fallback to demo cards for "wow" effect (as requested for UI parity)
  const sourceCards = isConnected ? apiSources : demoSourceCards;

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Create a workspace" description="Create a workspace before connecting data." />
      </div>
    );
  }

  const triggerUpload = () => fileRef.current?.click();
  const triggerNotesFile = () => notesFileRef.current?.click();

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      upload.mutate({ filename: f.name, rows: 0, at: new Date().toISOString() } as any, {
        onSuccess: (data: any) => {
          notify({
            tone: "success",
            title: "Data source uploaded",
            message: `${data.message}`,
          });
        },
        onError: () => {
          notify({
            tone: "error",
            title: "Upload failed",
            message: `Could not upload ${f.name}.`,
          });
        },
      });
    }
    e.target.value = "";
  };

  const handleConnect = async () => {
    notify({
      tone: "info",
      title: "Connection initiated",
      message: "Warehouse sync starting in background...",
    });
    setShowConnectForm(false);
  };

  return (
    <div className="page-content ds-page">
      <PageHeader
        title="Connected data"
        subtitle="Review your connected warehouse, inspect table schemas, and verify what the agents are using."
        actions={
          <>
            <input ref={fileRef} type="file" className="bs-file-input" onChange={onFile} aria-hidden />
            <input
              ref={notesFileRef}
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              className="bs-file-input"
              aria-hidden
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={triggerUpload}>
              Log upload
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={triggerNotesFile}>
              Add schema notes
            </button>
          </>
        }
      />

      {/* ── Connection Status ─────────────────────────────────── */}
      {isConnected ? (
        <div className="ds-connected-strip">
          <div className="ds-connected-strip-left">
            <span className="ds-connected-check"><IconCheck /></span>
            <div>
              <strong>Warehouse connected</strong>
              <span className="ds-connected-detail">{apiSources.length} tables mapped · 4 anomaly queries saved · Dashboard brief ready</span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowConnectForm(!showConnectForm)}
          >
            {showConnectForm ? "Hide" : "Reconnect / Edit"}
            <IconChevron open={showConnectForm} />
          </button>
        </div>
      ) : null}

      {upload.isSuccess ? (
        <div className="bs-banner bs-banner-ok">
          {upload.data.message} (id: {upload.data.upload_id})
        </div>
      ) : null}

      {/* Show connect form only if not connected, or if user chose to expand */}
      {(!isConnected || showConnectForm) ? (
        <ConnectRelationalCard
          databaseUrl={databaseUrl}
          schema={schema}
          schemaNotes={schemaNotes}
          onDatabaseUrlChange={setDatabaseUrl}
          onSchemaChange={setSchema}
          onSchemaNotesChange={setSchemaNotes}
          onUseDemoUri={() => setDatabaseUrl("postgresql+psycopg://source_demo:source_demo@source-postgres:5432/source_demo")}
          onConnect={handleConnect}
          connecting={false}
        />
      ) : null}

      {/* ── Section: Connected Tables ─────────────────────────── */}
      <SectionHeading
        icon={<IconDatabase />}
        title="Connected tables"
        subtitle={`${sourceCards.length} tables ${isConnected ? "synced from the warehouse" : "available in demo context"}`}
      />

      <div className="bs-source-grid">
        {q.isPending && !isConnected ? (
          <StateBlock title="Loading databases" loading />
        ) : (
          sourceCards.map((s: any) => (
            <div key={s.id} className="card bs-source-card">
              <div className="card-header">
                <div>
                  <div className="card-title">{s.name}</div>
                  <div className="card-subtitle">
                    {s.source_type.replaceAll("_", " ")} · {s.record_count.toLocaleString()} rows
                  </div>
                </div>
                <span className={`badge badge-${s.health === "ok" || s.health === "healthy" ? "default" : "high"}`}>{s.health}</span>
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
                
                {s.dimensions && (
                  <div className="bs-schema-preview">
                    <div className="td-sub">Dimensions</div>
                    <div className="bs-pill-row">
                      {s.dimensions.map((dim: string) => (
                        <span key={dim} className="bs-pill">
                          {dim}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bs-schema-preview" style={{ marginTop: s.dimensions ? 12 : 0 }}>
                  <div className="td-sub">Schema columns</div>
                  <div className="bs-pill-row">
                    {s.schema_preview.map((col: string) => (
                      <span key={col} className="bs-pill bs-pill-mono">
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
                {s.upload_history.length > 0 && (
                  <div className="bs-upload-history">
                    <div className="td-sub">Recent loads</div>
                    <ul className="bs-list">
                      {s.upload_history.map((h: any, i: number) => (
                        <li key={`${s.id}-${i}`}>
                          {h.filename} — {h.rows.toLocaleString()} rows · {formatDateTime(h.at)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Section: Source Intelligence ──────────────────────── */}
      <SectionHeading
        icon={<IconBrain />}
        title="Source intelligence"
        subtitle="What the schema agent has inferred about this warehouse"
      />

      <div className="card">
        <div className="card-body">
          <div className="ds-memory-grid">
            <div className="ds-memory-block">
              <div className="ds-memory-label">Engine</div>
              <div className="bs-pill-row" style={{ marginBottom: 12 }}>
                <span className="bs-pill">{demoSourceMemory.engine_name}</span>
                {demoSourceMemory.memory_path ? <span className="bs-pill bs-pill-mono">{demoSourceMemory.memory_path}</span> : null}
              </div>
              <div className="ds-memory-label">Schema summary</div>
              <pre className="bs-prewrap">{demoSourceMemory.summary_text}</pre>
            </div>
            <div className="ds-memory-block">
              <div className="ds-memory-label">Dashboard brief</div>
              <pre className="bs-prewrap">{demoSourceMemory.dashboard_brief}</pre>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section: Preset Anomaly Queries ───────────────────── */}
      <SectionHeading
        icon={<IconCode />}
        title="Preset anomaly queries"
        subtitle="Saved by the source agent so the anomaly dashboard stays consistent"
      />

      <div className="ds-query-grid">
        {demoAnomalyQueries.map((item) => (
          <div key={item.id} className="card ds-query-card">
            <div className="card-body">
              <div className="bs-query-head">
                <strong>{item.name}</strong>
                <span className="bs-pill">{item.category}</span>
              </div>
              <div className="card-subtitle" style={{ marginBottom: 10 }}>{item.description}</div>
              <div className="ds-query-sql-shell bg-[#050810] border border-white/5 rounded-md overflow-hidden mt-2">
                <Editor
                  value={item.sql_text}
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
            </div>
          </div>
        ))}
      </div>

      {/* ── Section: Dataset Browser ─────────────────────────── */}
      <SectionHeading
        icon={<IconTable />}
        title="Dataset browser"
        subtitle="Debug view of connected tables and their sample rows"
      />

      <div className="card">
        <div className="card-body">
          {demoDatasets.length ? (
            <div className="bs-split-panels">
              <DatasetListPanel datasets={demoDatasets} selectedName={selectedDataset} onSelect={setSelectedDataset} />

              <div className="card">
                <div className="card-body">
                  {preview ? (
                    <DatasetPreviewTable preview={preview} />
                  ) : (
                    <StateBlock title="Select a dataset" description="Choose a table on the left to preview its rows." />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <StateBlock title="No datasets available" description="Load a demo source to populate the dataset browser." />
          )}
        </div>
      </div>
    </div>
  );
}
