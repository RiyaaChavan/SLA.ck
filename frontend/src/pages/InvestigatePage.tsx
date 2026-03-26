import { useMemo, useRef, useEffect, useState } from "react";
import type { InvestigationResult } from "../types/api";
import { pickCopilotScenario, type DemoQueryRun } from "../demo/businessSentryHardcoded";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-sql";
import "prismjs/themes/prism-tomorrow.css";

type InvestigatePageProps = {
  onSubmit: (question: string) => Promise<InvestigationResult>;
  organizationId?: number;
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

const COPILOT_PACING = {
  reasoningBaseMs: 820,
  reasoningJitterMs: 280,
  actionBaseMs: 1320,
  actionJitterMs: 420,
  packagingMs: 1180,
  finalPauseMs: 780,
};

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/* ── tiny inline SVG icons ── */
const IconSend = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
);
const IconSparkle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" /><path d="M19 15l.5 2 2 .5-2 .5-.5 2-.5-2-2-.5 2-.5.5-2z" /></svg>
);
const IconChevron = ({ open }: { open: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "transform 200ms", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}><polyline points="6 9 12 15 18 9" /></svg>
);

function AgentTrace({ stream }: { stream: StreamEvent[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="chat-trace">
      <button type="button" className="chat-trace-toggle" onClick={() => setOpen((v) => !v)}>
        <span className="chat-trace-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          Agent trace · {stream.length} steps
        </span>
        <IconChevron open={open} />
      </button>
      {open ? (
        <div className="chat-trace-stream">
          {stream.map((event, idx) =>
            event.kind === "reasoning" ? (
              <div key={event.id} className="chat-trace-event">
                <div className="chat-trace-step-num">{idx + 1}</div>
                <div>
                  <div className="chat-trace-event-kind">Reasoning</div>
                  <div className="chat-trace-event-text">{event.text}</div>
                </div>
              </div>
            ) : (
              <div key={event.id} className="chat-trace-event chat-trace-event-action">
                <div className="chat-trace-step-num">{idx + 1}</div>
                <div style={{ flex: 1 }}>
                  <div className="chat-trace-event-head">
                    <div className="chat-trace-event-kind">SQL query</div>
                    <strong>{event.label}</strong>
                  </div>
                  <div className="chat-trace-event-note">{event.note}</div>
                  <div className="bg-[#050810] border border-white/5 rounded-md overflow-hidden mt-3">
                    <Editor
                      value={event.sql}
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
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function AssistantMessage({ turn }: { turn: ChatTurn }) {
  return (
    <div className="chat-msg chat-msg-assistant">
      <div className="chat-msg-avatar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" /></svg>
      </div>
      <div className="chat-msg-body chat-msg-body-assistant">
        <div className="chat-msg-sender">SLA.ck Copilot</div>

        <div className="chat-answer-summary text-sky-400 font-bold mb-2">{turn.summary}</div>
        <div className="chat-answer-explanation text-white/80 leading-relaxed mb-4">{turn.result.explanation}</div>

        {turn.result.rows.length ? (
          <div className="table-wrapper chat-answer-table mb-4">
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

        <div className="chat-sql-section mt-4 mb-4">
          <div className="chat-sql-label text-xs uppercase tracking-wider text-[#3283D0] font-mono mb-2">Final SQL Execution</div>
          <div className="bg-[#050810] border border-white/5 shadow-inner rounded-md overflow-hidden">
            <Editor
              value={turn.result.sql}
              onValueChange={() => {}}
              highlight={(code) => Prism.highlight(code, Prism.languages.sql, "sql")}
              padding={16}
              disabled
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: 13,
                backgroundColor: "transparent",
                lineHeight: "1.6",
              }}
            />
          </div>
        </div>

        <AgentTrace stream={turn.stream} />
      </div>
    </div>
  );
}

export function InvestigatePage({ onSubmit }: InvestigatePageProps) {
  const [draftQuestion, setDraftQuestion] = useState("");
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [liveStream, setLiveStream] = useState<StreamEvent[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [chat, liveStream]);

  const helperText = useMemo(() => {
    if (!loading) return "Ask about anomalies, SLA risk, warehouse capacity, or vendor leakage.";
    return "Agent is inspecting schema memory, selecting detectors, and composing an answer.";
  }, [loading]);

  const handleSubmit = async (override?: string) => {
    const input = (override || draftQuestion).trim();
    if (!input || loading) return;

    const scenario = pickCopilotScenario(input);
    setCurrentQuestion(input);
    setDraftQuestion("");
    setLoading(true);
    setLiveStream([]);

    // 1. Simulate reasoning
    for (const text of scenario.reasoning) {
      await sleep(COPILOT_PACING.reasoningBaseMs + Math.random() * COPILOT_PACING.reasoningJitterMs);
      setLiveStream((current) => [...current, { id: `evt-${current.length + 1}`, kind: "reasoning", text }]);
    }

    // 2. Simulate actions
    for (const action of scenario.actions) {
      await sleep(COPILOT_PACING.actionBaseMs + Math.random() * COPILOT_PACING.actionJitterMs);
      setLiveStream((current) => [
        ...current,
        {
          id: `evt-${current.length + 1}`,
          kind: "action" as const,
          label: action.label,
          note: action.note,
          sql: action.sql,
        },
      ]);
    }

    await sleep(COPILOT_PACING.packagingMs);
    const finalReasoning = "Packaging a concise answer, attaching the strongest rows, and preserving the execution trace.";
    setLiveStream((current) => [...current, { id: "reason-final", kind: "reasoning", text: finalReasoning }]);
    await sleep(COPILOT_PACING.finalPauseMs);

    // 3. Call real API for final result
    try {
      const result = await onSubmit(input);
      
      setChat((current) => [
        ...current,
        {
          id: `turn-${current.length + 1}`,
          question: input,
          summary: scenario.summary,
          result: result,
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
              text: finalReasoning,
            },
          ],
        },
      ]);
    } catch (err) {
      console.error("Investigation failed", err);
    } finally {
      setLoading(false);
      setLiveStream([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="page-content chat-page">
      <div className="page-header">
        <div>
          <div className="page-title">Chat with data</div>
          <div className="page-subtitle">
            Ask operational questions in plain English. The copilot reasons through your connected data like an analyst.
          </div>
        </div>
      </div>

      <div className="chat-shell">
        <div className="chat-thread" ref={threadRef}>
          {chat.length === 0 && !loading ? (
            <div className="chat-welcome">
              <div className="chat-welcome-icon">
                <IconSparkle />
              </div>
              <h2 className="chat-welcome-title">What would you like to investigate?</h2>
              <p className="chat-welcome-copy">
                Ask about anomaly routing, vendor leakage, SLA breach risk, warehouses, drivers, or capacity.
                The copilot reasons across your connected datasets.
              </p>
              <div className="chat-welcome-suggestions">
                {EXAMPLE_QUERIES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="chat-welcome-suggestion"
                    onClick={() => {
                        setDraftQuestion(item);
                        handleSubmit(item);
                    }}
                  >
                    <span className="chat-suggestion-arrow">→</span>
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {chat.map((turn) => (
            <div key={turn.id} className="chat-turn">
              <div className="chat-msg chat-msg-user">
                <div className="chat-msg-body chat-msg-body-user">{turn.question}</div>
              </div>
              <AssistantMessage turn={turn} />
            </div>
          ))}

          {loading ? (
            <div className="chat-turn">
              <div className="chat-msg chat-msg-user">
                <div className="chat-msg-body chat-msg-body-user">{currentQuestion}</div>
              </div>
              <div className="chat-msg chat-msg-assistant">
                <div className="chat-msg-avatar chat-msg-avatar-pulsing">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" /></svg>
                </div>
                <div className="chat-msg-body chat-msg-body-assistant">
                  <div className="chat-msg-sender">SLA.ck Copilot</div>
                  <div className="chat-thinking">
                    <span className="chat-thinking-dot" />
                    <span className="chat-thinking-dot" />
                    <span className="chat-thinking-dot" />
                    <span className="chat-thinking-label">Working through the connected dataset…</span>
                  </div>
                  {liveStream.length ? (
                    <div className="chat-trace-stream chat-trace-stream-live">
                      {liveStream.map((event, idx) =>
                        event.kind === "reasoning" ? (
                          <div key={event.id} className="chat-trace-event chat-trace-event-live">
                            <div className="chat-trace-step-num">{idx + 1}</div>
                            <div>
                              <div className="chat-trace-event-kind">Reasoning</div>
                              <div className="chat-trace-event-text">{event.text}</div>
                            </div>
                          </div>
                        ) : (
                          <div key={event.id} className="chat-trace-event chat-trace-event-action chat-trace-event-live">
                            <div className="chat-trace-step-num">{idx + 1}</div>
                            <div style={{ flex: 1 }}>
                              <div className="chat-trace-event-head">
                                <div className="chat-trace-event-kind">SQL query</div>
                                <strong>{event.label}</strong>
                              </div>
                              <div className="chat-trace-event-note">{event.note}</div>
                              <div className="bg-[#050810] border border-white/5 rounded-md overflow-hidden mt-3">
                                <Editor
                                  value={event.sql}
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
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Composer ── */}
        <div className="chat-composer">
          <div className="chat-composer-inner">
            <textarea
              className="chat-composer-input"
              value={draftQuestion}
              onChange={(e) => setDraftQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask about anomalies, SLAs, vendors, resources, or operations…"
            />
            <button
              type="button"
              className="chat-composer-send"
              onClick={() => handleSubmit()}
              disabled={loading || !draftQuestion.trim()}
              title="Send"
            >
              <IconSend />
            </button>
          </div>
          <div className="chat-composer-footer">
            <span className="chat-composer-hint">{helperText}</span>
            <div className="chat-composer-chips">
              {EXAMPLE_QUERIES.map((item) => (
                <button key={item} type="button" className="chat-composer-chip" onClick={() => handleSubmit(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
