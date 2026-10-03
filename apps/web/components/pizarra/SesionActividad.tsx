"use client";

import { useState, type CSSProperties } from "react";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import CheckIcon from "@mui/icons-material/Check";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { formatApiError } from "@/lib/erp-api";
import {
  MOTIVO_PAUSA_MAX,
  MOTIVO_PAUSA_MIN,
  errorMotivoPausa,
  pausarActividadDeEquipo,
  pausarMiActividad,
  puedePausar,
  puedeReanudar,
  reanudarMiActividad,
  textoPausa,
  type SesionActividad,
} from "@/lib/sesion-actividad";

const btn: CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  fontWeight: 650,
  fontSize: 13,
  padding: "8px 12px",
  minHeight: 40,
  borderRadius: 10,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const btnOk: CSSProperties = {
  ...btn,
  border: "none",
  background: "#16a34a",
  color: "#fff",
  fontWeight: 700,
};

const btnPrimary: CSSProperties = {
  ...btn,
  border: "none",
  background: "var(--primary)",
  color: "#fff",
  fontWeight: 750,
};

const input: CSSProperties = {
  padding: "10px 12px",
  minHeight: 64,
  borderRadius: 10,
  border: "1px solid var(--border)",
  fontSize: 16,
  fontFamily: "inherit",
  background: "var(--surface)",
  color: "inherit",
  resize: "vertical",
};

function hora(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

/**
 * El reloj de la propia actividad: «En pausa» (quién y por qué) con «Reanudar», o
 * «Pausar» mientras corre. No pinta nada si no hay reloj que mover (sin iniciar,
 * entregada, API anterior).
 *
 * Pausar no termina la actividad: sigue «En Proceso». Terminar sigue siendo la foto
 * de salida y la revisión.
 */
export function SesionPropia({
  token,
  activityId,
  actividad,
  miId,
  onDone,
}: {
  token: string;
  activityId: number;
  actividad: SesionActividad & { despachador?: boolean | null; estatus?: string | null };
  miId?: number | null;
  onDone?: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const correr = async (accion: () => Promise<unknown>, fallo: string) => {
    setGuardando(true);
    setError(null);
    try {
      await accion();
      onDone?.();
    } catch (e) {
      setError(formatApiError(e, fallo));
    } finally {
      setGuardando(false);
    }
  };

  if (puedeReanudar(actividad)) {
    return (
      <div
        role="note"
        style={{
          display: "grid",
          gap: 8,
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid color-mix(in srgb, #d97706 35%, var(--border))",
          background: "color-mix(in srgb, #d97706 8%, var(--surface))",
        }}
      >
        <div style={{ fontSize: 13, lineHeight: 1.45 }}>
          <strong style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <PauseCircleOutlineIcon aria-hidden="true" sx={{ fontSize: 16 }} />
            En pausa
          </strong>{" "}
          {textoPausa(actividad, { miId, propia: true })}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            style={{ ...btnOk, opacity: guardando ? 0.7 : 1 }}
            disabled={guardando}
            onClick={() => void correr(() => reanudarMiActividad(token, activityId), "No se pudo reanudar la actividad")}
          >
            <PlayCircleOutlineIcon aria-hidden="true" sx={{ fontSize: 17 }} />
            {guardando ? "Reanudando…" : "Reanudar actividad"}
          </button>
          <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
            Tu reloj vuelve a correr. Se detiene al pausar, al checar salida, a las 12 h o al terminar el día.
          </span>
        </div>
        {error ? <p style={{ margin: 0, color: "#dc2626", fontSize: 12.5 }}>{error}</p> : null}
      </div>
    );
  }

  if (!puedePausar(actividad)) return null;

  const desde = hora(actividad.sesionAbiertaDesde);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          style={{ ...btn, opacity: guardando ? 0.7 : 1 }}
          disabled={guardando}
          onClick={() =>
            setConfirm({
              title: "Pausar actividad",
              message:
                "Tu reloj se detiene en esta actividad; sigue «En Proceso» y la reanudas cuando vuelvas a ella.",
              confirmLabel: "Pausar",
              danger: false,
              fn: () => correr(() => pausarMiActividad(token, activityId), "No se pudo pausar la actividad"),
            })
          }
        >
          <PauseCircleOutlineIcon aria-hidden="true" sx={{ fontSize: 17 }} />
          {guardando ? "Pausando…" : "Pausar"}
        </button>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
          {desde ? `Reloj corriendo desde las ${desde}.` : "Reloj corriendo."}
        </span>
      </div>
      {error ? <p style={{ margin: 0, color: "#dc2626", fontSize: 12.5 }}>{error}</p> : null}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} danger={false} />
    </div>
  );
}

/**
 * Un jefe (o dirección) pausa la actividad en curso de alguien de su equipo para que
 * atienda otra que salió urgente. El motivo es obligatorio: queda quién la pausó y por
 * qué, y la persona recibe el aviso.
 */
export function PausarDeEquipo({
  token,
  userId,
  activityId,
  nombre,
  onDone,
}: {
  token: string;
  userId: number;
  activityId: number;
  /** Nombre de la persona, para el texto del botón y del aviso. */
  nombre?: string | null;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const guardar = async () => {
    const invalido = errorMotivoPausa(motivo);
    if (invalido) {
      setError(invalido);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await pausarActividadDeEquipo(token, userId, activityId, motivo);
      setOk(nombre ? `Pausada. ${nombre} ya recibió el aviso.` : "Pausada. La persona ya recibió el aviso.");
      setOpen(false);
      setMotivo("");
      onDone?.();
    } catch (e) {
      setError(formatApiError(e, "No se pudo pausar la actividad"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {!open ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            style={btn}
            onClick={() => {
              setOpen(true);
              setOk(null);
              setError(null);
            }}
          >
            <PauseCircleOutlineIcon aria-hidden="true" sx={{ fontSize: 17 }} />
            Pausar
          </button>
          <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
            Detiene su reloj para que atienda otra cosa; la actividad sigue abierta.
          </span>
        </div>
      ) : null}
      {ok && !open ? (
        <div style={{ fontSize: 12.5, color: "#15803d", display: "flex", alignItems: "center", gap: 5 }}>
          <CheckIcon aria-hidden="true" sx={{ fontSize: 15 }} />
          <span>{ok}</span>
        </div>
      ) : null}
      {open ? (
        <div
          style={{
            display: "grid",
            gap: 10,
            padding: 12,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 650, color: "var(--text-secondary)" }}>
            ¿Por qué la pausas? *
            <textarea
              autoFocus
              rows={2}
              maxLength={MOTIVO_PAUSA_MAX}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Salió una falla urgente en el cliente; que la atienda primero."
              style={input}
            />
            <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 500 }}>
              {Math.min(motivo.trim().length, MOTIVO_PAUSA_MIN)}/{MOTIVO_PAUSA_MIN} caracteres mínimo · la persona lo
              ve en su aviso.
            </span>
          </label>
          {error ? <div style={{ fontSize: 12.5, color: "#b91c1c" }}>{error}</div> : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={saving}
              style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Pausando…" : "Pausar actividad"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={saving} style={btn}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
