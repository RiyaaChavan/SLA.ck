/** Single demo currency format for phase 1 (per WORKSTREAM_SYNC assumptions). */

export function formatMoneyInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

export function formatPercent(p: number): string {
  return `${(p * 100).toFixed(0)}%`;
}

export function formatModuleLabel(module: string | undefined | null): string {
  return (module ?? "general").replaceAll("_", " ");
}
