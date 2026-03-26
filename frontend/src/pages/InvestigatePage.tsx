import { useState } from "react";
import type { InvestigationResult } from "../types/api";

type InvestigatePageProps = {
  onSubmit: (question: string) => Promise<InvestigationResult>;
};

const EXAMPLE_QUERIES = [
  "Which vendors caused the highest billing discrepancy this quarter?",
  "Show top 10 idle resources sorted by monthly cost.",
  "Which departments exceeded their budget by more than 20%?",
];

export function InvestigatePage({ onSubmit }: InvestigatePageProps) {
  const [question, setQuestion] = useState(EXAMPLE_QUERIES[0]);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!question.trim()) return;
    setLoading(true);
    try {
      const data = await onSubmit(question);
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-content">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="page-title">SQL Copilot</div>
          <div className="page-subtitle">
            Read-only SQL over connected data — for analysts and agents; RBAC can scope this later.
          </div>
        </div>
      </div>

      {/* Query input card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Ask an operations question</div>
            <div className="card-subtitle">Natural language is converted to read-only SQL and executed</div>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <textarea
              className="investigate-textarea"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              placeholder="e.g. Which vendors caused the highest billing discrepancy this quarter?"
            />

            {/* Example queries */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {EXAMPLE_QUERIES.map((q) => (
                <button
                  key={q}
                  className="btn btn-secondary btn-sm"
                  onClick={() => setQuestion(q)}
                  style={{ fontWeight: 400, fontSize: 12 }}
                >
                  {q.length > 48 ? q.slice(0, 48) + "…" : q}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={loading || !question.trim()}
              >
                {loading ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Querying...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Run Investigation
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {result ? (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Query Result</div>
              <div className="card-subtitle">{result.explanation}</div>
            </div>
            <span className="badge badge-violet">{result.rows.length} row{result.rows.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div className="sql-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                </svg>
                Generated SQL
              </div>
              <pre className="sql-box">{result.sql}</pre>
            </div>

            {result.rows.length > 0 && (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      {Object.keys(result.rows[0] ?? {}).map((key) => (
                        <th key={key}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((val, j) => (
                          <td key={j}>{String(val)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
