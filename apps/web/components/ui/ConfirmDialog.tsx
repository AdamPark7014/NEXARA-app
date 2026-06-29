"use client";

import Button from "./Button";

export interface ConfirmState {
  message: string;
  confirmLabel?: string;
  fn: () => void | Promise<void>;
}

interface Props {
  state: ConfirmState | null;
  onClose: () => void;
  /** Set to true when the action is destructive (red confirm button). Default: true */
  danger?: boolean;
}

/**
 * Lightweight inline confirmation dialog.
 * Usage:
 *   const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
 *   // To trigger: setConfirmState({ message: "¿Eliminar X?", fn: () => doDelete() });
 *   // In JSX: <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
 */
export default function ConfirmDialog({ state, onClose, danger = true }: Props) {
  if (!state) return null;

  const handleConfirm = () => {
    void Promise.resolve(state.fn());
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 1000,
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Dialog */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-msg"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1001,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: "24px 28px",
          width: "min(420px, 90vw)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <p
          id="confirm-dialog-msg"
          style={{
            margin: "0 0 22px",
            fontSize: 14.5,
            lineHeight: 1.55,
            color: "var(--text-primary)",
            fontWeight: 500,
          }}
        >
          {state.message}
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={handleConfirm}
          >
            {state.confirmLabel ?? (danger ? "Eliminar" : "Confirmar")}
          </Button>
        </div>
      </div>
    </>
  );
}
