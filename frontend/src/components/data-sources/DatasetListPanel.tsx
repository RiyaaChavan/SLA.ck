import type { DatasetSummary } from "../../domain/business-sentry";

type DatasetListPanelProps = {
  datasets: DatasetSummary[];
  selectedName: string | null;
  onSelect: (name: string) => void;
};

export function DatasetListPanel({ datasets, selectedName, onSelect }: DatasetListPanelProps) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="bs-detector-ul">
          {datasets.map((dataset) => (
            <button
              key={dataset.name}
              type="button"
              className={`bs-detector-item ${selectedName === dataset.name ? "bs-detector-item-active" : ""}`}
              onClick={() => onSelect(dataset.name)}
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
