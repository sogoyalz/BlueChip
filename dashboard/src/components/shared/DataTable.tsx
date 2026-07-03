import React from "react";

import Skeleton from "./Skeleton";

// Column shape: { key, label, render?(row), cellClass?(row) }
// The stylesheet right-aligns all columns except the first (instrument).
export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  cellClass?: (row: T) => string | undefined;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey?: (row: T, index: number) => React.Key;
  loading?: boolean;
  loadingLabel?: string;
  emptyContent?: React.ReactNode;
}

const DataTable = <T extends object>({
  columns,
  rows,
  rowKey,
  loading = false,
  loadingLabel = "Loading…",
  emptyContent = null,
}: DataTableProps<T>) => (
  <div className="order-table">
    <table>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr>
            <td colSpan={columns.length}>
              <Skeleton label={loadingLabel} />
            </td>
          </tr>
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="empty-cell">
              {emptyContent}
            </td>
          </tr>
        ) : (
          rows.map((row, index) => (
            <tr key={rowKey ? rowKey(row, index) : index}>
              {columns.map((col) => (
                <td key={col.key} className={col.cellClass?.(row)}>
                  {col.render
                    ? col.render(row)
                    : (row as Record<string, React.ReactNode>)[col.key]}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export default DataTable;
