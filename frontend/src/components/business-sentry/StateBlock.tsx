type StateBlockProps = {
  title: string;
  description?: string;
  loading?: boolean;
};

export function StateBlock({ title, description, loading }: StateBlockProps) {
  return (
    <div className="card">
      <div className="empty-state" style={{ padding: "48px 24px" }}>
        {loading ? (
          <div className="empty-icon bs-spinner" aria-hidden />
        ) : (
          <div className="empty-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
        )}
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
  );
}
