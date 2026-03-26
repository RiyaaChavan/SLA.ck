import type { InvestigationResult } from "../types/api";
import { InvestigatePage } from "./InvestigatePage";
import { StateBlock } from "../components/business-sentry/StateBlock";

type CopilotPageProps = {
  organizationId?: number;
  onSubmit: (question: string) => Promise<InvestigationResult>;
};

export function CopilotPage({ organizationId, onSubmit }: CopilotPageProps) {
  if (!organizationId) {
    return (
      <div className="page-content">
        <StateBlock title="Create a workspace" description="Create a workspace before running Copilot." />
      </div>
    );
  }
  return <InvestigatePage onSubmit={onSubmit} />;
}
