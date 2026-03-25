type StatCardProps = {
  label: string;
  value: string;
  delta?: string;
};

export function StatCard({ label, value, delta }: StatCardProps) {
  const isNegative = delta?.startsWith("-");
  const isPositive = delta && !isNegative;

  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {delta ? (
        <div className={`stat-delta ${isPositive ? "positive" : "negative"}`}>
          {isPositive ? "↑" : "↓"} {delta}
        </div>
      ) : (
        <div className="stat-delta neutral">— Stable</div>
      )}
    </div>
  );
}
