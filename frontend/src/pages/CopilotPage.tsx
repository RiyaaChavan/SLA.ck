import { InvestigatePage } from "./InvestigatePage";
import { StateBlock } from "../components/business-sentry/StateBlock";

type CopilotPageProps = {
  organizationId?: number;
};

export function CopilotPage({ organizationId }: CopilotPageProps) {
  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Create a workspace" description="Create a workspace before running Copilot." />
      </div>
    );
  }
  return <InvestigatePage organizationId={organizationId} />;
}
