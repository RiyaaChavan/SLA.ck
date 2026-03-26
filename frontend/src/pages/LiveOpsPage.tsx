import { PageHeader } from "../components/business-sentry/PageHeader";
import { StateBlock } from "../components/business-sentry/StateBlock";
import { formatMoneyInr, formatDateTime } from "../lib/formatters";
import { useLiveOps } from "../hooks/useBusinessSentry";
import { NavLink } from "react-router-dom";

type LiveOpsPageProps = {
  organizationId?: number;
};

export function LiveOpsPage({ organizationId }: LiveOpsPageProps) {
  const q = useLiveOps(organizationId);

  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Select a workspace" description="Choose an organization in the sidebar." />
      </div>
    );
  }

  if (q.isPending) {
    return (
      <div className="page-content">
        <StateBlock title="Loading live ops" loading />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="page-content">
        <StateBlock title="Could not load live ops" />
      </div>
    );
  }

  const rows = [...q.data].sort((a, b) => {
    const risk = b.predicted_breach_risk - a.predicted_breach_risk;
    if (risk !== 0) return risk;
    const t = (a.time_remaining_minutes ?? 99999) - (b.time_remaining_minutes ?? 99999);
    if (t !== 0) return t;
    return b.projected_penalty - a.projected_penalty;
  });

  return (
    <div className="page-content">
      <PageHeader
        title="Tickets"
        subtitle="Linear-style queue: deadlines, SLA risk, and intervention — prioritized for what’s due next."
      />

      <div className="card">
        <div className="card-body-flush">
          <div className="table-wrapper bs-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Team</th>
                  <th>Owner</th>
                  <th>Stage</th>
                  <th>SLA</th>
                  <th>Time left</th>
                  <th>Breach risk</th>
                  <th>Penalty</th>
                  <th>Case</th>
                  <th>Intervention</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <code className="bs-code">{r.id}</code>
                    </td>
                    <td>{r.item_type.replaceAll("_", " ")}</td>
                    <td>
                      <div className="td-main">{r.title}</div>
                      <div className="td-sub">{r.status}</div>
                    </td>
                    <td>{r.team}</td>
                    <td>{r.owner_name}</td>
                    <td>{r.current_stage}</td>
                    <td>{r.assigned_sla_name}</td>
                    <td>{r.time_remaining_minutes}m</td>
                    <td>{(r.predicted_breach_risk * 100).toFixed(0)}%</td>
                    <td>{formatMoneyInr(r.projected_penalty)}</td>
                    <td>
                      <NavLink to={`/cases?case=${encodeURIComponent(r.linked_case_id)}`} className="btn btn-ghost btn-sm">
                        {r.linked_case_id}
                      </NavLink>
                    </td>
                    <td className="td-sub">{r.suggested_action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p className="bs-footnote">Response deadline: {rows[0] ? formatDateTime(rows[0].response_deadline) : "—"} (first row)</p>
    </div>
  );
}
