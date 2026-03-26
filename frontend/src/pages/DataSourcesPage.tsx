import { useEffect, useMemo, useState, type ReactNode } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-sql";
import "prismjs/themes/prism-tomorrow.css";
import { ConnectRelationalCard } from "../components/data-sources/ConnectRelationalCard";
import { DatasetListPanel } from "../components/data-sources/DatasetListPanel";
import { DatasetPreviewTable } from "../components/data-sources/DatasetPreviewTable";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { useNotifications } from "../components/shared/Notifications";
import { formatDateTime } from "../lib/formatters";
import {
  useConnectors,
  useCreateConnector,
  useDataSourcePreview,
  useDataSources,
  useDetectors,
  useSourceMemory,
  useUpdateConnector,
} from "../hooks/useBusinessSentry";

type DataSourcesPageProps = {
  organizationId?: number;
};

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

function SectionHeading({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
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
  const connectorsQuery = useConnectors(organizationId);
  const sourcesQuery = useDataSources(organizationId);
  const memoryQuery = useSourceMemory(organizationId);
  const detectorsQuery = useDetectors(organizationId);
  const createConnectorMutation = useCreateConnector(organizationId);
  const updateConnectorMutation = useUpdateConnector(organizationId);

  const [databaseUrl, setDatabaseUrl] = useState("");
  const [schema, setSchema] = useState("public");
  const [schemaNotes, setSchemaNotes] = useState("");
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null);
  const [isEditingConnector, setIsEditingConnector] = useState(false);
  const previewQuery = useDataSourcePreview(selectedRelationId);

  const relations = sourcesQuery.data ?? [];
  const connectors = connectorsQuery.data ?? [];
  const detectors = detectorsQuery.data ?? [];
  const memory = memoryQuery.data;
  const primaryConnector = connectors[0] ?? null;
  const isConnected = Boolean(primaryConnector);
  const isSavingConnector = createConnectorMutation.isPending || updateConnectorMutation.isPending;

  useEffect(() => {
    if (!selectedRelationId && relations.length > 0) {
      setSelectedRelationId(relations[0].id);
    }
  }, [relations, selectedRelationId]);

  useEffect(() => {
    if (primaryConnector && !isEditingConnector) {
      setSchema((primaryConnector.included_schemas ?? ["public"]).join(", "));
      setDatabaseUrl("");
    }
  }, [primaryConnector, isEditingConnector]);

  const datasets = useMemo(
    () =>
      relations.map((item) => ({
        id: item.id,
        name: item.name,
        record_count: item.record_count,
        columns: item.schema_preview,
        source_uri: item.qualified_name ?? item.name,
        schema: item.schema ?? "public",
      })),
    [relations],
  );

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Create a workspace" description="Create a workspace before connecting data." />
      </div>
    );
  }

  const handleConnect = async () => {
    if (primaryConnector && primaryConnector.status !== "ready" && !databaseUrl.trim()) {
      notify({
        tone: "error",
        title: "Connection URI required",
        message: "This connector is currently failing. Paste a replacement Postgres URI before saving.",
      });
      return;
    }

    try {
      const includedSchemas = schema
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const connector = primaryConnector
        ? await updateConnectorMutation.mutateAsync({
            connectorId: primaryConnector.id,
            body: {
              name: primaryConnector.name,
              included_schemas: includedSchemas,
              ...(databaseUrl.trim() ? { uri: databaseUrl.trim() } : {}),
            },
          })
        : await createConnectorMutation.mutateAsync({
            name: `Postgres ${schema.trim() || "public"} connector`,
            uri: databaseUrl.trim(),
            included_schemas: includedSchemas,
          });
      notify({
        tone: "success",
        title: primaryConnector ? "Connection updated" : "Source connected",
        message: `${connector.name} synced. Tables and views are now cached for preview.`,
      });
      setIsEditingConnector(false);
    } catch (error) {
      notify({
        tone: "error",
        title: primaryConnector ? "Update failed" : "Connection failed",
        message: error instanceof Error ? error.message : "Could not connect to the source.",
      });
    }
  };

  return (
    <div className="page-content ds-page">
      <PageHeader
        title="Connected data"
        subtitle="Connect a Postgres warehouse, inspect discovered tables and views, and review the generated source intelligence."
      />

      {isConnected ? (
        <div className="ds-connected-strip">
          <div className="ds-connected-strip-left">
            <span className="ds-connected-check"><IconDatabase /></span>
            <div>
              <strong>{primaryConnector?.name}</strong>
              <span className="ds-connected-detail">
                {relations.length} relations cached · last sync {primaryConnector?.last_sync_at ? formatDateTime(primaryConnector.last_sync_at) : "pending"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsEditingConnector((current) => !current)}
            >
              {isEditingConnector ? "Cancel edit" : "Edit connection"}
            </button>
            <span className={`badge badge-${primaryConnector?.status === "ready" ? "default" : "high"}`}>
              {primaryConnector?.status ?? "pending"}
            </span>
          </div>
        </div>
      ) : null}

      {!isConnected || isEditingConnector ? (
        <div
          className="bs-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (isConnected) setIsEditingConnector(false);
          }}
        >
          <div role="dialog" aria-modal="true" className="bs-modal-card" onClick={(event) => event.stopPropagation()}>
            <ConnectRelationalCard
              title={primaryConnector ? "Edit source connection" : "Connect a source"}
              subtitle={
                primaryConnector
                  ? "Update the Postgres URI or schema scope, then re-sync cached relations, summaries, and presets."
                  : "Connect a relational database, add optional operating notes, and let SLA.ck prepare source memory and reusable anomaly checks."
              }
              submitLabel={primaryConnector ? "Save and re-sync" : "Connect source"}
              databaseUrl={databaseUrl}
              schema={schema}
              schemaNotes={schemaNotes}
              onDatabaseUrlChange={setDatabaseUrl}
              onSchemaChange={setSchema}
              onSchemaNotesChange={setSchemaNotes}
              onUseDemoUri={() =>
                setDatabaseUrl("postgresql+psycopg://costpulse:costpulse@localhost:5432/costpulse")
              }
              onConnect={handleConnect}
              connecting={isSavingConnector}
            />
          </div>
        </div>
      ) : null}

      <SectionHeading
        icon={<IconDatabase />}
        title="Connected tables and views"
        subtitle={
          relations.length
            ? `${relations.length} relations discovered from the source cache`
            : "No cached relations yet"
        }
      />

      <div className="bs-source-grid">
        {sourcesQuery.isPending ? (
          <StateBlock title="Loading source cache" loading />
        ) : !relations.length ? (
          <StateBlock
            title="No relations discovered"
            description={primaryConnector?.last_error ?? "Connect a Postgres source to populate the relation cache."}
          />
        ) : (
          relations.map((relation) => (
            <div key={relation.id} className="card bs-source-card">
              <div className="card-header">
                <div>
                  <div className="card-title">{relation.qualified_name}</div>
                  <div className="card-subtitle">
                    {relation.source_type.replaceAll("_", " ")} · {relation.record_count.toLocaleString()} estimated rows
                  </div>
                </div>
                <span className={`badge badge-${relation.health === "healthy" ? "default" : "high"}`}>{relation.health}</span>
              </div>
              <div className="card-body">
                <div className="bs-source-meta">
                  <span>Status</span>
                  <strong>{relation.status}</strong>
                  <span>Freshness</span>
                  <strong>{relation.freshness_status}</strong>
                  <span>Last synced</span>
                  <strong>{formatDateTime(relation.last_synced_at)}</strong>
                </div>

                <div className="bs-schema-preview" style={{ marginTop: 12 }}>
                  <div className="td-sub">Schema columns</div>
                  <div className="bs-pill-row">
                    {relation.schema_preview.map((column) => (
                      <span key={column} className="bs-pill bs-pill-mono">
                        {column}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <SectionHeading
        icon={<IconBrain />}
        title="Source intelligence"
        subtitle="Summary, dashboard brief, and schema notes from the SQL agent"
      />

      <div className="card">
        <div className="card-body">
          {memoryQuery.isPending ? (
            <StateBlock title="Waiting for source intelligence" loading />
          ) : !memory || memory.status !== "ready" ? (
            <StateBlock
              title="Source intelligence pending"
              description="The SQL agent has not finished writing summary and dashboard notes yet."
            />
          ) : (
            <div className="ds-memory-grid">
              <div className="ds-memory-block">
                <div className="ds-memory-label">Engine</div>
                <div className="bs-pill-row" style={{ marginBottom: 12 }}>
                  <span className="bs-pill">{memory.engine_name}</span>
                </div>
                <div className="ds-memory-label">Schema summary</div>
                <pre className="bs-prewrap">{memory.summary_text}</pre>
              </div>
              <div className="ds-memory-block">
                <div className="ds-memory-label">Dashboard brief</div>
                <pre className="bs-prewrap">{memory.dashboard_brief}</pre>
                {memory.schema_notes ? (
                  <>
                    <div className="ds-memory-label" style={{ marginTop: 16 }}>Schema notes</div>
                    <pre className="bs-prewrap">{memory.schema_notes}</pre>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      <SectionHeading
        icon={<IconCode />}
        title="Preset anomaly queries"
        subtitle="Generated SQL presets that will run on the source on a schedule"
      />

      <div className="ds-query-grid">
        {detectorsQuery.isPending ? (
          <StateBlock title="Loading generated presets" loading />
        ) : !detectors.length ? (
          <StateBlock title="No presets yet" description="The SQL agent has not generated anomaly queries for this connector yet." />
        ) : (
          detectors.map((item) => (
            <div key={item.id} className="card ds-query-card">
              <div className="card-body">
                <div className="bs-query-head">
                  <strong>{item.name}</strong>
                  <span className="bs-pill">{item.module}</span>
                </div>
                <div className="card-subtitle" style={{ marginBottom: 10 }}>{item.description}</div>
                <div className="bs-pill-row" style={{ marginBottom: 10 }}>
                  <span className="bs-pill">{item.schedule_minutes} min</span>
                  <span className="bs-pill">{item.validation_status}</span>
                </div>
                <div className="ds-query-sql-shell bg-[#050810] border border-white/5 rounded-md overflow-hidden mt-2">
                  <Editor
                    value={item.query_logic}
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
          ))
        )}
      </div>

      <SectionHeading
        icon={<IconTable />}
        title="Dataset browser"
        subtitle="Preview cached sample rows from the discovered source relations"
      />

      <div className="card">
        <div className="card-body">
          {!datasets.length ? (
            <StateBlock title="No datasets available" description="Connect a source and wait for the relation cache to populate." />
          ) : (
            <div className="bs-split-panels">
              <DatasetListPanel datasets={datasets} selectedName={selectedRelationId} onSelect={setSelectedRelationId} />
              <div className="card">
                <div className="card-body">
                  {previewQuery.isPending ? (
                    <StateBlock title="Loading preview" loading />
                  ) : previewQuery.data ? (
                    <DatasetPreviewTable preview={previewQuery.data} />
                  ) : (
                    <StateBlock title="Select a dataset" description="Choose a relation on the left to preview its cached rows." />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
