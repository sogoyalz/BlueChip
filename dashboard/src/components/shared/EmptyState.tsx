import React from "react";

interface EmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState = ({ message, actionLabel, onAction }: EmptyStateProps) => (
  <div className="empty-state">
    <p>{message}</p>
    {actionLabel && (
      <button type="button" className="btn btn-red" onClick={onAction}>
        {actionLabel}
      </button>
    )}
  </div>
);

export default EmptyState;
