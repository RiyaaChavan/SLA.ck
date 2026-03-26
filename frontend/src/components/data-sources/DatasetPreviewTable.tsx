import type { DatasetPreview } from "../../domain/business-sentry";

type DatasetPreviewTableProps = {
  preview: DatasetPreview;
};

export function DatasetPreviewTable({ preview }: DatasetPreviewTableProps) {
  return (
    <>
      <div className="bs-inline-meta">
        <span className="bs-pill">{preview.schema}</span>
        <span className="bs-pill">{preview.columns.length} columns</span>
        <span className="bs-pill">{preview.row_count.toLocaleString()} rows</span>
      </div>
      <div className="bs-table-scroll">
        <table className="table">
          <thead>
            <tr>
              {preview.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {preview.columns.map((column) => (
                  <td key={`${rowIndex}-${column}`}>{String(row[column] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
