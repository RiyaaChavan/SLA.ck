import type { DatasetSummary } from "../../domain/business-sentry";

type DatasetListPanelProps = {
  datasets: DatasetSummary[];
  selectedName: string | null;
  onSelect: (id: string) => void;
};

export function DatasetListPanel({ datasets, selectedName, onSelect }: DatasetListPanelProps) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="bs-detector-ul">
          {datasets.map((dataset) => (
            <button
              key={dataset.id}
              type="button"
              className={`bs-detector-item ${selectedName === dataset.id ? "bs-detector-item-active" : ""}`}
              onClick={() => onSelect(dataset.id)}
            >
              <span className="bs-detector-name">{dataset.name}</span>
              <span>{dataset.record_count.toLocaleString()} rows</span>
              <span>{dataset.columns.slice(0, 4).join(", ")}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
