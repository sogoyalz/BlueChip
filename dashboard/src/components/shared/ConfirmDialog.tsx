import React, { useEffect, useRef } from "react";

import "./ConfirmDialog.css";

interface ConfirmDialogProps {
  title: string;
  /** What exactly is about to happen — shown verbatim, so name the thing. */
  body: React.ReactNode;
  confirmLabel: string;
  /** Label shown while the action is running; the dialog stays open until done. */
  pendingLabel?: string;
  cancelLabel?: string;
  /** Destructive actions get the red treatment; everything else stays neutral. */
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

/**
 * A confirmation the design system owns, rather than window.confirm.
 *
 * Beyond looking like the rest of the app, this is what lets the caller keep
 * the dialog open and disabled while the action is in flight — the native
 * dialog returns immediately and gives you nowhere to show progress, which is
 * how a slow cancel invites a second click.
 */
const ConfirmDialog = ({
  title,
  body,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Keep it",
  destructive = false,
  pending = false,
  onConfirm,
  onDismiss,
}: ConfirmDialogProps) => {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button on open, and put Escape back where users expect it.
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss, pending]);

  return (
    <div
      className="confirm-overlay"
      data-testid="confirm-overlay"
      onClick={() => !pending && onDismiss()}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="confirm-title" id="confirm-title">
          {title}
        </h2>
        <div className="confirm-body" id="confirm-body">
          {body}
        </div>
        <div className="confirm-actions">
          <button
            type="button"
            className="btn btn-grey"
            onClick={onDismiss}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={`btn ${destructive ? "btn-red" : "btn-outline"}`}
            onClick={onConfirm}
            // Disabled while in flight: the single guard against a double-click
            // sending a second cancel for the same order.
            disabled={pending}
          >
            {pending ? pendingLabel ?? confirmLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
