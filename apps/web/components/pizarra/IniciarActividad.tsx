"use client";

import { useState, type CSSProperties } from "react";
import { iniciarMiActividad } from "@/lib/my-activities-api";
import { formatApiError } from "@/lib/erp-api";
import { ACCION_INICIAR } from "@/lib/actividad-tiempos";

type Props = {
  token: string;
  activityId: number;
  onDone?: () => void;
};

const btnOk: CSSProperties = {
  border: "none",
  background: "#16a34a",
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  padding: "8px 14px",
  borderRadius: 10,
  cursor: "pointer",
  fontFamily: "inherit",
};

/**
 * «Iniciar actividad»: la única acción de quien recibe una actividad.
 *
 * Regla del dueño (18-09): no se acepta ni se rechaza, únicamente se inicia. Al
 * tocarlo se guarda la hora real de inicio (el fin lo marca la foto de salida). Si
 * la persona no puede hacerla, lo habla con su jefe, que es quien la reasigna.
 * Quién lo ve lo decide `puedeIniciar()`.
 */
export default function IniciarActividad({ token, activityId, onDone }: Props) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iniciar = async () => {
    if (!token) return;
    setGuardando(true);
    setError(null);
    try {
      await iniciarMiActividad(token, activityId);
      onDone?.();
    } catch (e) {
      setError(formatApiError(e, "No se pudo iniciar la actividad"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          style={{ ...btnOk, opacity: guardando ? 0.7 : 1 }}
          onClick={() => void iniciar()}
          disabled={guardando}
        >
          {guardando ? "Iniciando…" : ACCION_INICIAR}
        </button>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
          Queda registrada tu hora real de inicio.
        </span>
      </div>
      {error ? <p style={{ margin: 0, color: "#dc2626", fontSize: 12.5 }}>{error}</p> : null}
    </div>
  );
}
