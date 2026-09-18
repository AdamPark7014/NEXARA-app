"use client";

import { useState, type CSSProperties } from "react";
import { formatApiError } from "@/lib/erp-api";
import { marcarUniforme } from "@/lib/kpis-equipo";

const VERDE = "#16a34a";
const ROJO = "#dc2626";

function boton(activo: boolean, color: string): CSSProperties {
  return {
    minHeight: 30,
    padding: "4px 10px",
    borderRadius: 8,
    border: `1px solid ${activo ? color : "var(--border)"}`,
    background: activo ? `color-mix(in srgb, ${color} 14%, var(--surface))` : "var(--surface)",
    color: activo ? color : "var(--text-secondary)",
    fontWeight: activo ? 750 : 600,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

/**
 * ✓ / ✗ de uniforme junto a la foto de entrada (KPI «cumplimiento con uniforme»).
 * Tocar el que ya está marcado lo regresa a «sin revisar». Quien no puede marcar
 * (la propia persona, alguien fuera de su organigrama) solo ve el estado.
 */
export default function UniformeControl({
  attendanceId,
  uniformeOk,
  revisadoAt,
  editable,
  token,
  onCambio,
}: {
  attendanceId?: number | null;
  uniformeOk?: boolean | null;
  revisadoAt?: string | null;
  editable: boolean;
  token: string;
  onCambio: (ok: boolean | null, revisadoAt: string | null) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const estado = uniformeOk ?? null;
  const cuando = revisadoAt
    ? new Date(revisadoAt).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  if (!attendanceId) return null;

  if (!editable) {
    const texto = estado === true ? "Uniforme ✓" : estado === false ? "Sin uniforme ✗" : "Uniforme sin revisar";
    const color = estado === true ? VERDE : estado === false ? ROJO : "var(--text-tertiary)";
    return (
      <span style={{ fontSize: 11.5, fontWeight: 650, color }} title={cuando ? `Revisado ${cuando}` : undefined}>
        {texto}
      </span>
    );
  }

  const marcar = async (ok: boolean) => {
    const nuevo = estado === ok ? null : ok;
    setGuardando(true);
    setError(null);
    try {
      const res = await marcarUniforme(token, attendanceId, nuevo);
      onCambio(res?.data?.uniformeOk ?? nuevo, res?.data?.uniformeRevisadoAt ?? null);
    } catch (e) {
      setError(formatApiError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div role="group" aria-label="Uniforme en la entrada" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 650, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          Uniforme
        </span>
        <button
          type="button"
          aria-pressed={estado === true}
          disabled={guardando}
          onClick={() => void marcar(true)}
          style={boton(estado === true, VERDE)}
          title={estado === true ? "Quitar la marca" : "Traía uniforme"}
        >
          ✓ Sí
        </button>
        <button
          type="button"
          aria-pressed={estado === false}
          disabled={guardando}
          onClick={() => void marcar(false)}
          style={boton(estado === false, ROJO)}
          title={estado === false ? "Quitar la marca" : "No traía uniforme"}
        >
          ✗ No
        </button>
        {cuando && estado !== null ? (
          <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>Revisado {cuando}</span>
        ) : null}
      </div>
      {error ? (
        <span role="alert" style={{ fontSize: 11.5, color: ROJO }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
