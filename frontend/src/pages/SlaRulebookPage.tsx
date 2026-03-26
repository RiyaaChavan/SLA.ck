import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { formatMoneyInr, formatDateTime } from "../lib/formatters";
import {
  useSlaBatchApprove,
  useSlaBatchDiscard,
  useSlaExtractionUpload,
  useSlaExtractions,
  useSlaRules,
} from "../hooks/useBusinessSentry";

type SlaRulebookPageProps = {
  organizationId?: number;
};

export function SlaRulebookPage({ organizationId }: SlaRulebookPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = useMemo(
    () => (searchParams.get("tab") === "active" ? "active" : "extraction"),
    [searchParams],
  );
  const setTab = (next: "extraction" | "active") => {
    setSearchParams(next === "active" ? { tab: "active" } : { tab: "extraction" }, { replace: true });
  };
  const rulesQ = useSlaRules(organizationId);
  const extQ = useSlaExtractions(organizationId);
  const approve = useSlaBatchApprove(organizationId);
  const discard = useSlaBatchDiscard(organizationId);
  const upload = useSlaExtractionUpload(organizationId);
  const [filter, setFilter] = useState("");

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Select a workspace" />
      </div>
    );
  }

  const activeRules = (rulesQ.data ?? []).filter(
    (r) =>
      !filter ||
      r.name.toLowerCase().includes(filter.toLowerCase()) ||
      r.applies_to.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="page-content">
      <PageHeader
        title="SLAs"
        subtitle="Import contracts (PDF, docs, text, image) to extract rules, then browse and govern active SLAs."
      />

      <div className="bs-tabs">
        <button type="button" className={tab === "extraction" ? "bs-tab bs-tab-active" : "bs-tab"} onClick={() => setTab("extraction")}>
          Extraction review
        </button>
        <button type="button" className={tab === "active" ? "bs-tab bs-tab-active" : "bs-tab"} onClick={() => setTab("active")}>
          Active rules
        </button>
      </div>

      {tab === "extraction" ? (
        <>
          <div className="bs-toolbar">
            <button type="button" className="btn btn-secondary" disabled={upload.isPending} onClick={() => upload.mutate("contract_upload.pdf")}>
              Upload SLA document (stub)
            </button>
          </div>
          {extQ.isPending ? (
            <StateBlock title="Loading extractions" loading />
          ) : extQ.isError ? (
            <StateBlock title="Failed to load extractions" />
          ) : (
            <div className="bs-extraction-list">
              {(extQ.data ?? []).map((b) => (
                <div key={b.id} className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">{b.source_document_name}</div>
                      <div className="card-subtitle">
                        {b.status} · uploaded {formatDateTime(b.uploaded_at)}
                      </div>
                    </div>
                    <div className="bs-card-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={approve.isPending || b.status !== "pending_review"}
                        onClick={() => approve.mutate(b.id)}
                      >
                        Approve batch
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={discard.isPending}
                        onClick={() => discard.mutate(b.id)}
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                  <div className="card-body">
                    <h4 className="td-sub">Candidate rules</h4>
                    <ul className="bs-list">
                      {b.candidate_rules.map((c) => (
                        <li key={c.temp_id}>
                          <strong>{c.name}</strong> — response {c.response_deadline_hours}h / resolution {c.resolution_deadline_hours}h · penalty{" "}
                          {formatMoneyInr(c.penalty_amount)}
                          <div className="bs-card-actions" style={{ marginTop: 8 }}>
                            <button type="button" className="btn btn-ghost btn-sm">
                              Edit (local)
                            </button>
                            <button type="button" className="btn btn-ghost-danger btn-sm">
                              Discard candidate
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="bs-toolbar">
            <input
              className="bs-input bs-input-grow"
              placeholder="Search rules…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          {rulesQ.isPending ? (
            <StateBlock title="Loading rules" loading />
          ) : rulesQ.isError ? (
            <StateBlock title="Failed to load rules" />
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Applies to</th>
                    <th>Response / Resolution</th>
                    <th>Penalty</th>
                    <th>Source doc</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {activeRules.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>
                        <span className="badge badge-default">{r.status}</span>
                      </td>
                      <td>{r.applies_to}</td>
                      <td>
                        {r.response_deadline_hours}h / {r.resolution_deadline_hours}h
                      </td>
                      <td>{formatMoneyInr(r.penalty_amount)}</td>
                      <td className="td-sub">{r.source_document_name}</td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm">
                          Edit
                        </button>
                        <button type="button" className="btn btn-ghost-danger btn-sm">
                          Archive
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
