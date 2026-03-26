type StatCardProps = {
  label: string;
  value: string;
  detail?: string;
  detailTone?: "positive" | "negative" | "neutral";
};

export function StatCard({
  label,
  value,
  detail,
  detailTone = "neutral",
}: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {detail ? (
        <div className={`stat-delta ${detailTone}`}>{detail}</div>
      ) : (
        <div className="stat-delta neutral">Current snapshot</div>
      )}
    </div>
  );
}
