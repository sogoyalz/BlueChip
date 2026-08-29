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
  /** Names the table for screen readers — a bare grid of numbers otherwise. */
  label?: string;
}

const DataTable = <T extends object>({
  columns,
  rows,
  rowKey,
  loading = false,
  loadingLabel = "Loading…",
  emptyContent = null,
  label,
}: DataTableProps<T>) => (
  <div className="order-table">
    <table aria-label={label}>
      <thead>
        <tr>
          {columns.map((col) => (
            // scope="col": without it a screen reader reading a cell cannot say
            // which column it belongs to, which on an orders grid turns the
            // table into an unlabelled stream of numbers.
            <th key={col.key} scope="col">
              {col.label}
            </th>
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
