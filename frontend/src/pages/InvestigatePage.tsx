import { useMemo, useState } from "react";
import type { InvestigationResult } from "../types/api";
import { pickCopilotScenario, type DemoQueryRun } from "../demo/businessSentryHardcoded";

type InvestigatePageProps = {
  onSubmit?: (question: string) => Promise<InvestigationResult>;
};

type StreamEvent =
  | { id: string; kind: "reasoning"; text: string }
  | { id: string; kind: "action"; label: string; note: string; sql: string };

type ChatTurn = {
  id: string;
  question: string;
  summary: string;
  result: InvestigationResult;
  stream: StreamEvent[];
};

const EXAMPLE_QUERIES = [
  "Which anomalies should I send to Finance AP right now?",
  "Where are we likely to breach SLA in the next hour?",
  "Which warehouses or drivers look overprovisioned?",
];

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function AgentTrace({ stream }: { stream: StreamEvent[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bs-chat-trace">
      <button type="button" className="bs-chat-trace-toggle" onClick={() => setOpen((v) => !v)}>
        <span>Agent trace</span>
        <span>{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="bs-agent-stream">
          {stream.map((event) =>
            event.kind === "reasoning" ? (
              <div key={event.id} className="bs-agent-event">
                <div className="bs-agent-event-kind">Reasoning</div>
                <div>{event.text}</div>
              </div>
            ) : (
              <div key={event.id} className="bs-agent-event bs-agent-event-action">
                <div className="bs-agent-event-head">
                  <div className="bs-agent-event-kind">Action</div>
                  <strong>{event.label}</strong>
                </div>
                <div className="bs-agent-event-note">{event.note}</div>
                <pre className="bs-code-block">{event.sql}</pre>
              </div>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function AssistantMessage({ turn }: { turn: ChatTurn }) {
  return (
    <div className="bs-chat-row bs-chat-row-assistant">
      <div className="bs-chat-avatar bs-chat-avatar-assistant">BS</div>
      <div className="bs-chat-bubble bs-chat-bubble-assistant">
        <div className="bs-chat-bubble-label">Business Sentry Copilot</div>
        <div className="bs-agent-summary">{turn.summary}</div>
        <div className="bs-agent-answer">{turn.result.explanation}</div>

        {turn.result.rows.length ? (
          <div className="table-wrapper bs-chat-table">
            <table>
              <thead>
                <tr>
                  {Object.keys(turn.result.rows[0] ?? {}).map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {turn.result.rows.map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((val, j) => (
                      <td key={j}>{String(val)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div>
          <div className="sql-label">Final SQL</div>
          <pre className="sql-box">{turn.result.sql}</pre>
        </div>

        <AgentTrace stream={turn.stream} />
      </div>
    </div>
  );
}

export function InvestigatePage(_: InvestigatePageProps) {
  const [question, setQuestion] = useState("");
  const [draftQuestion, setDraftQuestion] = useState(EXAMPLE_QUERIES[0]);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [liveStream, setLiveStream] = useState<StreamEvent[]>([]);

  const helperText = useMemo(() => {
    if (!loading) return "Ask about anomalies, SLA risk, warehouse capacity, or vendor leakage.";
    return "Agent is inspecting schema memory, selecting detectors, and composing an answer.";
  }, [loading]);

  const appendReasoning = (text: string) => {
    setLiveStream((current) => [...current, { id: `evt-${current.length + 1}`, kind: "reasoning", text }]);
  };

  const appendAction = (action: DemoQueryRun) => {
    setLiveStream((current) => [
      ...current,
      {
        id: `evt-${current.length + 1}`,
        kind: "action",
        label: action.label,
        note: action.note,
        sql: action.sql,
      },
    ]);
  };

  const handleSubmit = async () => {
    const input = draftQuestion.trim();
    if (!input || loading) return;

    const scenario = pickCopilotScenario(input);
    setQuestion(input);
    setLoading(true);
    setLiveStream([]);

    for (const text of scenario.reasoning) {
      await sleep(380 + Math.random() * 180);
      appendReasoning(text);
    }

    for (const action of scenario.actions) {
      await sleep(560 + Math.random() * 240);
      appendAction(action);
    }

    await sleep(620);
    appendReasoning("Packaging a concise answer, attaching the strongest rows, and preserving the execution trace.");
    await sleep(460);

    setChat((current) => [
      ...current,
      {
        id: `turn-${current.length + 1}`,
        question: input,
        summary: scenario.summary,
        result: scenario.result,
        stream: [
          ...scenario.reasoning.map((text, index) => ({
            id: `reason-${index + 1}`,
            kind: "reasoning" as const,
            text,
          })),
          ...scenario.actions.map((action, index) => ({
            id: `action-${index + 1}`,
            kind: "action" as const,
            label: action.label,
            note: action.note,
            sql: action.sql,
          })),
          {
            id: "reason-final",
            kind: "reasoning" as const,
            text: "Packaging a concise answer, attaching the strongest rows, and preserving the execution trace.",
          },
        ],
      },
    ]);

    setLoading(false);
    setLiveStream([]);
    setDraftQuestion("");
  };

  return (
    <div className="page-content bs-chat-page">
      <div className="page-header">
        <div>
          <div className="page-title">Chat with data</div>
          <div className="page-subtitle">
            Ask a question in plain English. The demo copilot responds like an agent-backed analyst, not a debug console.
          </div>
        </div>
      </div>

      <div className="bs-chat-shell">
        <div className="bs-chat-thread">
          {chat.length === 0 ? (
            <div className="bs-chat-empty card">
              <div className="card-body">
                <div className="bs-chat-empty-title">Start with an operations question</div>
                <div className="bs-chat-empty-copy">
                  Ask about anomaly routing, vendor leakage, SLA breach risk, warehouses, drivers, or capacity.
                </div>
                <div className="bs-chat-suggestions">
                  {EXAMPLE_QUERIES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="bs-chat-suggestion"
                      onClick={() => setDraftQuestion(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {chat.map((turn) => (
            <div key={turn.id} className="bs-chat-turn">
              <div className="bs-chat-row bs-chat-row-user">
                <div className="bs-chat-bubble bs-chat-bubble-user">{turn.question}</div>
              </div>
              <AssistantMessage turn={turn} />
            </div>
          ))}

          {loading ? (
            <div className="bs-chat-turn">
              <div className="bs-chat-row bs-chat-row-user">
                <div className="bs-chat-bubble bs-chat-bubble-user">{question}</div>
              </div>
              <div className="bs-chat-row bs-chat-row-assistant">
                <div className="bs-chat-avatar bs-chat-avatar-assistant">BS</div>
                <div className="bs-chat-bubble bs-chat-bubble-assistant">
                  <div className="bs-chat-bubble-label">Business Sentry Copilot</div>
                  <div className="bs-chat-thinking">
                    <span className="bs-chat-thinking-dot" />
                    <span className="bs-chat-thinking-dot" />
                    <span className="bs-chat-thinking-dot" />
                    <span>Working through the connected dataset…</span>
                  </div>
                  {liveStream.length ? (
                    <div className="bs-agent-stream">
                      {liveStream.map((event) =>
                        event.kind === "reasoning" ? (
                          <div key={event.id} className="bs-agent-event">
                            <div className="bs-agent-event-kind">Reasoning</div>
                            <div>{event.text}</div>
                          </div>
                        ) : (
                          <div key={event.id} className="bs-agent-event bs-agent-event-action">
                            <div className="bs-agent-event-head">
                              <div className="bs-agent-event-kind">Action</div>
                              <strong>{event.label}</strong>
                            </div>
                            <div className="bs-agent-event-note">{event.note}</div>
                            <pre className="bs-code-block">{event.sql}</pre>
                          </div>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="bs-chat-composer card">
          <div className="card-body">
            <div className="bs-chat-composer-top">
              <textarea
                className="investigate-textarea bs-chat-input"
                value={draftQuestion}
                onChange={(e) => setDraftQuestion(e.target.value)}
                rows={3}
                placeholder="Ask a question about anomalies, SLAs, vendors, resources, or operations."
              />
              <button type="button" className="btn btn-primary bs-chat-send" onClick={handleSubmit} disabled={loading || !draftQuestion.trim()}>
                {loading ? "Running…" : "Send"}
              </button>
            </div>
            <div className="bs-chat-composer-meta">
              <span>{helperText}</span>
              <div className="bs-chat-chip-row">
                {EXAMPLE_QUERIES.map((item) => (
                  <button key={item} type="button" className="bs-chat-chip" onClick={() => setDraftQuestion(item)}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
