import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ConnectRelationalCard } from "../components/data-sources/ConnectRelationalCard";
import { DatasetListPanel } from "../components/data-sources/DatasetListPanel";
import { DatasetPreviewTable } from "../components/data-sources/DatasetPreviewTable";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { formatDateTime } from "../lib/formatters";
import {
  demoAnomalyQueries,
  demoDatasetPreviews,
  demoDatasets,
  demoSourceCards,
  demoSourceMemory,
} from "../demo/businessSentryHardcoded";

type DataSourcesPageProps = {
  organizationId?: number;
  onSourceConnected?: (organizationId: number) => void | Promise<void>;
};

const DEMO_URI = "postgresql+psycopg://source_demo:source_demo@source-postgres:5432/source_demo";
const DEMO_ORG_ID = 101;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function DataSourcesPage({ onSourceConnected }: DataSourcesPageProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const notesFileRef = useRef<HTMLInputElement>(null);

  const [databaseUrl, setDatabaseUrl] = useState(DEMO_URI);
  const [schema, setSchema] = useState("synthetic_demo");
  const [schemaNotes, setSchemaNotes] = useState("");
  const [selectedDataset, setSelectedDataset] = useState<string | null>(demoDatasets[0]?.name ?? null);
  const [sourceCards, setSourceCards] = useState(demoSourceCards);
  const [connectState, setConnectState] = useState<"idle" | "pending" | "success">("success");
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedDataset && demoDatasets.length) {
      setSelectedDataset(demoDatasets[0].name);
    }
  }, [selectedDataset]);

  const preview = useMemo(
    () => (selectedDataset ? demoDatasetPreviews[selectedDataset] ?? null : null),
    [selectedDataset],
  );

  const triggerUpload = () => fileRef.current?.click();
  const triggerNotesFile = () => notesFileRef.current?.click();

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      await sleep(400);
      setUploadMessage(`Logged ${f.name} for schema review and freshness tracking.`);
      setSourceCards((current) => {
        const [first, ...rest] = current;
        if (!first) return current;
        return [
          {
            ...first,
            upload_history: [
              {
                filename: f.name,
                rows: first.upload_history[0]?.rows ?? first.record_count,
                at: new Date().toISOString(),
              },
              ...first.upload_history,
            ].slice(0, 3),
          },
          ...rest,
        ];
      });
    }
    e.target.value = "";
  };

  const onNotesFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setSchemaNotes(await f.text());
      setUploadMessage(`Loaded ${f.name} and attached its notes to the source context.`);
    }
    e.target.value = "";
  };

  const handleConnect = async () => {
    setConnectState("pending");
    setUploadMessage(null);
    await sleep(950);
    setConnectState("success");
    await onSourceConnected?.(DEMO_ORG_ID);
  };

  return (
    <div className="page-content">
      <PageHeader
        title="Connected data"
        subtitle="Review the connected warehouse, inspect table shapes, and verify what the schema agent is using before anomalies and dashboards go live."
        actions={
          <>
            <input ref={fileRef} type="file" className="bs-file-input" onChange={onFile} aria-hidden />
            <input
              ref={notesFileRef}
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              className="bs-file-input"
              onChange={onNotesFile}
              aria-hidden
            />
            <button type="button" className="btn btn-secondary" onClick={triggerUpload}>
              Log upload
            </button>
            <button type="button" className="btn btn-secondary" onClick={triggerNotesFile}>
              Add schema notes
            </button>
          </>
        }
      />

      {connectState === "success" ? (
        <div className="bs-banner bs-banner-ok">
          Connected QuickBasket India. The schema agent mapped 6 core tables, saved 4 anomaly queries, and prepared a
          dashboard brief for operations and finance.
        </div>
      ) : null}
      {uploadMessage ? <div className="bs-banner bs-banner-ok">{uploadMessage}</div> : null}

      <ConnectRelationalCard
        databaseUrl={databaseUrl}
        schema={schema}
        schemaNotes={schemaNotes}
        onDatabaseUrlChange={setDatabaseUrl}
        onSchemaChange={setSchema}
        onSchemaNotesChange={setSchemaNotes}
        onUseDemoUri={() => setDatabaseUrl(DEMO_URI)}
        onConnect={handleConnect}
        connecting={connectState === "pending"}
      />

      <div className="bs-source-grid">
        {sourceCards.map((s) => (
          <div key={s.id} className="card bs-source-card">
            <div className="card-header">
              <div>
                <div className="card-title">{s.name}</div>
                <div className="card-subtitle">
                  {s.source_type.replaceAll("_", " ")} · {s.record_count.toLocaleString()} rows
                </div>
              </div>
              <span className={`badge badge-${s.health === "healthy" ? "default" : "high"}`}>{s.health}</span>
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
                <div className="td-sub">Dimensions</div>
                <div className="bs-pill-row">
                  {s.dimensions.map((item) => (
                    <span key={item} className="bs-pill">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bs-schema-preview" style={{ marginTop: 12 }}>
                <div className="td-sub">Header preview</div>
                <div className="bs-pill-row">
                  {s.schema_preview.map((col) => (
                    <span key={col} className="bs-pill">
                      {col}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bs-upload-history">
                <div className="td-sub">Recent loads</div>
                <ul className="bs-list">
                  {s.upload_history.map((h, i) => (
                    <li key={`${s.id}-${i}`}>
                      {h.filename} — {h.rows.toLocaleString()} rows · {formatDateTime(h.at)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bs-source-debug-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Source memory</div>
              <div className="card-subtitle">What the schema agent has inferred about this warehouse.</div>
            </div>
          </div>
          <div className="card-body">
            <div className="bs-stack">
              <div className="bs-inline-meta">
                <span className="bs-pill">{demoSourceMemory.engine_name}</span>
                {demoSourceMemory.memory_path ? <span className="bs-pill">{demoSourceMemory.memory_path}</span> : null}
              </div>
              <pre className="bs-prewrap">{demoSourceMemory.summary_text}</pre>
              <div className="td-sub">Dashboard brief</div>
              <pre className="bs-prewrap">{demoSourceMemory.dashboard_brief}</pre>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Preset anomaly queries</div>
              <div className="card-subtitle">Saved by the source agent so the anomaly dashboard stays consistent.</div>
            </div>
          </div>
          <div className="card-body">
            <div className="bs-query-list">
              {demoAnomalyQueries.map((item) => (
                <div key={item.id} className="bs-query-card">
                  <div className="bs-query-head">
                    <strong>{item.name}</strong>
                    <span className="bs-pill">{item.category}</span>
                  </div>
                  <div className="card-subtitle">{item.description}</div>
                  <pre className="bs-code-block">{item.sql_text}</pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Dataset previewer</div>
            <div className="card-subtitle">Debug view of the connected tables and their headers.</div>
          </div>
        </div>
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
