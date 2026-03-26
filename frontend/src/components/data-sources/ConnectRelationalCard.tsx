import { useState } from "react";

type ConnectRelationalCardProps = {
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  databaseUrl: string;
  schema: string;
  schemaNotes: string;
  onDatabaseUrlChange: (v: string) => void;
  onSchemaChange: (v: string) => void;
  onSchemaNotesChange: (v: string) => void;
  onUseDemoUri: () => void;
  onConnect: () => void;
  connecting: boolean;
};

export function ConnectRelationalCard({
  title = "Connect a source",
  subtitle = "Connect a relational database, add optional operating notes, and let SLA.ck prepare source memory and reusable anomaly checks.",
  submitLabel = "Connect source",
  databaseUrl,
  schema,
  schemaNotes,
  onDatabaseUrlChange,
  onSchemaChange,
  onSchemaNotesChange,
  onUseDemoUri,
  onConnect,
  connecting,
}: ConnectRelationalCardProps) {
  const [showDatabaseUrl, setShowDatabaseUrl] = useState(false);

  return (
    <div className="card bs-connect-card">
      <div className="card-header">
        <div>
          <div className="card-title">{title}</div>
          <div className="card-subtitle">{subtitle}</div>
        </div>
      </div>
      <div className="card-body">
        <div className="bs-source-form">
          <label className="bs-field">
            <span>Connection URI</span>
            <div className="bs-input-with-action">
              <input
                className="bs-input bs-mono bs-input-with-action-field"
                type={showDatabaseUrl ? "text" : "password"}
                value={databaseUrl}
                onChange={(e) => onDatabaseUrlChange(e.target.value)}
                placeholder="postgresql+psycopg://user:pass@host:5432/db or sqlite:///absolute/path.db"
              />
              <button
                type="button"
                className="bs-input-action"
                onClick={() => setShowDatabaseUrl((current) => !current)}
                aria-label={showDatabaseUrl ? "Hide connection URI" : "Show connection URI"}
                aria-pressed={showDatabaseUrl}
              >
                {showDatabaseUrl ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <label className="bs-field">
            <span>Schema</span>
            <input className="bs-input bs-mono" value={schema} onChange={(e) => onSchemaChange(e.target.value)} />
          </label>
          <label className="bs-field bs-field-span">
            <span>Additional schema notes</span>
            <textarea
              className="bs-textarea bs-mono"
              value={schemaNotes}
              onChange={(e) => onSchemaNotesChange(e.target.value)}
              placeholder="Paste operational notes, table caveats, SLA definitions, or md/txt context for the source agent."
            />
          </label>
        </div>
        <div className="bs-action-row">
          <button type="button" className="btn btn-secondary" onClick={onUseDemoUri}>
            Load demo connection
          </button>
          <button type="button" className="btn btn-primary" onClick={onConnect} disabled={connecting}>
            {connecting ? "Connecting…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
