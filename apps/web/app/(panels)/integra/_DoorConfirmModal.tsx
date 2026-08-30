"use client";

import { useEffect, useState } from "react";
import { IgBtn } from "./_Console";
import { DOOR_CONTROL_OPTIONS, DoorControlType, inputStyle } from "./_lib";

type Props = {
  open: boolean;
  doorName: string;
  doorId: string;
  controlType: DoorControlType;
  busy?: boolean;
  onControlTypeChange?: (t: DoorControlType) => void;
  allowTypeSelect?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

export function DoorConfirmModal({
  open,
  doorName,
  doorId,
  controlType,
  busy,
  onControlTypeChange,
  allowTypeSelect,
  onCancel,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open, doorId]);

  if (!open) return null;

  const label =
    DOOR_CONTROL_OPTIONS.find((o) => o.value === controlType)?.label || controlType;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="door-confirm-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "color-mix(in srgb, #0b1524 45%, transparent)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--surface, #fff)",
          borderRadius: 14,
          padding: 20,
          width: "min(420px, 100%)",
          boxShadow: "0 18px 50px rgba(11,21,36,0.25)",
          display: "grid",
          gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="door-confirm-title" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
          Confirmar control de puerta
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary, #64748b)" }}>
          <strong>{doorName}</strong>
          <br />
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{doorId}</span>
        </p>
        {allowTypeSelect && onControlTypeChange ? (
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Acción
            <select
              value={controlType}
              onChange={(e) => onControlTypeChange(e.target.value as DoorControlType)}
              style={inputStyle}
            >
              {DOOR_CONTROL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p style={{ margin: 0, fontSize: 13 }}>
            Acción: <strong>{label}</strong>
          </p>
        )}
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          Motivo (obligatorio)
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Ej. visita autorizada, mantenimiento, emergencia…"
            style={{ ...inputStyle, maxWidth: "100%", resize: "vertical" }}
            autoFocus
          />
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <IgBtn onClick={onCancel} disabled={busy}>
            Cancelar
          </IgBtn>
          <IgBtn
            variant="primary"
            disabled={busy || reason.trim().length < 3}
            onClick={() => onConfirm(reason.trim())}
          >
            {busy ? "…" : "Confirmar"}
          </IgBtn>
        </div>
      </div>
    </div>
  );
}
