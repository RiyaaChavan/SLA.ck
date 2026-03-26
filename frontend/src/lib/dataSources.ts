import type { DataSourceUploadPayload } from "../adapters/business-sentry/contract";

function titleCaseName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Uploaded Source";
  return trimmed
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function buildFileUploadPayload(fileName: string): DataSourceUploadPayload {
  return {
    name: titleCaseName(fileName),
    source_type: "file_upload",
    record_count: 0,
    file_name: fileName,
    sample_columns: [],
  };
}

export function buildConnectorStubPayload(workspaceName: string): DataSourceUploadPayload {
  const trimmed = workspaceName.trim();
  const prefix = trimmed || "Workspace";
  return {
    name: `${prefix} starter connector`,
    source_type: "connector_stub",
    record_count: 0,
    file_name: "connector_stub.json",
    sample_columns: ["record_id", "updated_at", "status"],
  };
}
