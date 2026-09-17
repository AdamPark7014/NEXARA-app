"use client";

import { useState, type CSSProperties } from "react";
import { aceptarMiActividad, rechazarMiActividad } from "@/lib/my-activities-api";
import { formatApiError } from "@/lib/erp-api";
import type { Aceptacion } from "@/lib/actividad-tiempos";

const MIN_MOTIVO = 10;

type Props = {
  token: string;
  activityId: number;
  /** Estado actual; si la API es anterior al contrato llega undefined y no se muestra nada. */
  aceptacion?: Aceptacion;
  motivoRechazo?: string | null;
  /** Título para el diálogo («¿Por qué no puedes hacer X?»). */
  titulo?: string;
  onDone?: () => void;
};

const btn: CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  fontWeight: 700,
  fontSize: 13,
  padding: "8px 14px",
  borderRadius: 10,
  cursor: "pointer",
  fontFamily: "inherit",
};

const btnOk: CSSProperties = {
  ...btn,
  border: "none",
  background: "#16a34a",
  color: "#fff",
};

/**
 * Aceptar o rechazar (con motivo) la actividad que te asignaron.
 *
 * Rechazar no la quita de tu lista: avisa a quien la asignó y a tus jefes, que son
 * quienes deciden moverla. Si la API todavía no manda `aceptacion`, no se pinta nada.
 */
export default function AceptarRechazar({
  token,
  activityId,
  aceptacion,
  motivoRechazo,
  titulo,
  onDone,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!aceptacion || aceptacion === "ACEPTADA") return null;

  const aceptar = async () => {
    if (!token) return;
    setGuardando(true);
    setError(null);
    try {
      await aceptarMiActividad(token, activityId);
      onDone?.();
    } catch (e) {
      setError(formatApiError(e, "No se pudo aceptar la actividad"));
    } finally {
      setGuardando(false);
    }
  };

  const rechazar = async () => {
    if (!token) return;
    const texto = motivo.trim();
    if (texto.length < MIN_MOTIVO) {
      setError(`Escribe al menos ${MIN_MOTIVO} caracteres: por qué no puedes hacerla.`);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await rechazarMiActividad(token, activityId, texto);
      setAbierto(false);
      setMotivo("");
      onDone?.();
    } catch (e) {
      setError(formatApiError(e, "No se pudo registrar el rechazo"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {aceptacion === "RECHAZADA" ? (
        <p
          style={{
            margin: 0,
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid color-mix(in srgb, #dc2626 35%, var(--border))",
            background: "color-mix(in srgb, #dc2626 8%, var(--surface))",
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          <strong>Rechazada:</strong> {motivoRechazo || "sin motivo registrado"}. Sigue asignada a ti
          hasta que tu encargado la mueva.
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={btnOk} onClick={() => void aceptar()} disabled={guardando}>
          {aceptacion === "RECHAZADA" ? "Aceptar de todos modos" : "Aceptar"}
        </button>
        {aceptacion === "PENDIENTE" ? (
          <button
            type="button"
            style={btn}
            onClick={() => {
              setAbierto(true);
              setError(null);
            }}
            disabled={guardando}
          >
            Rechazar
          </button>
        ) : null}
      </div>

      {error && !abierto ? <p style={{ margin: 0, color: "#dc2626", fontSize: 12.5 }}>{error}</p> : null}

      {abierto ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Rechazar actividad"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            zIndex: 9999,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 460,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              padding: 20,
              display: "grid",
              gap: 12,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 17, lineHeight: 1.35 }}>
              ¿Por qué no puedes hacer{titulo ? ` «${titulo}»` : " esta actividad"}?
            </h2>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>
              Se avisa a quien te la asignó y a tus jefes. La actividad sigue siendo tuya hasta que
              alguien la pase o la cancele.
            </p>
            <textarea
              autoFocus
              rows={3}
              maxLength={500}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Estoy en una emergencia en Plaza Dorada y no alcanzo a llegar hoy."
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 12,
                border: "1px solid var(--border)",
                fontFamily: "inherit",
                fontSize: 14,
                resize: "vertical",
                background: "var(--surface)",
                color: "inherit",
              }}
            />
            <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
              {Math.min(motivo.trim().length, MIN_MOTIVO)}/{MIN_MOTIVO} caracteres mínimo
            </span>
            {error ? <p style={{ margin: 0, color: "#dc2626", fontSize: 13 }}>{error}</p> : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" style={btn} onClick={() => setAbierto(false)} disabled={guardando}>
                Cancelar
              </button>
              <button
                type="button"
                style={{
                  ...btn,
                  border: "none",
                  background: "#dc2626",
                  color: "#fff",
                  opacity: guardando || motivo.trim().length < MIN_MOTIVO ? 0.6 : 1,
                }}
                onClick={() => void rechazar()}
                disabled={guardando || motivo.trim().length < MIN_MOTIVO}
              >
                {guardando ? "Enviando…" : "Rechazar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
