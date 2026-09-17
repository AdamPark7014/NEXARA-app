"use client";

import { useState, type CSSProperties } from "react";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import CheckIcon from "@mui/icons-material/Check";
import { formatApiError } from "@/lib/erp-api";
import { reprogramarDespacho } from "@/lib/my-activities-api";

function toLocalParts(iso?: string | null): { fecha: string; hora: string } {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return { fecha: "", hora: "09:00" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    fecha: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function formatAgenda(iso?: string | null): string {
  if (!iso) return "Sin fecha";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  return d.toLocaleString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  minHeight: 44,
  borderRadius: 10,
  border: "1px solid var(--border)",
  fontSize: 16,
  fontFamily: "inherit",
  background: "var(--surface)",
  color: "inherit",
};

type Props = {
  token: string;
  activityId: number;
  /** Día/hora programada actual (ISO). */
  fechaActual?: string | null;
  onDone?: () => void;
};

/** Quien reparte un despacho cambia su día y hora; queda en el Historial de la actividad. */
export default function ReprogramarDespacho({ token, activityId, fechaActual, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("09:00");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const abrir = () => {
    const p = toLocalParts(fechaActual);
    setFecha(p.fecha);
    setHora(p.hora);
    setMotivo("");
    setError(null);
    setOk(null);
    setOpen(true);
  };

  const guardar = async () => {
    if (!fecha || !hora) {
      setError("Elige el día y la hora");
      return;
    }
    const nueva = new Date(`${fecha}T${hora}:00`);
    if (Number.isNaN(nueva.getTime())) {
      setError("Fecha u hora inválida");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await reprogramarDespacho(token, activityId, {
        fecha: nueva.toISOString(),
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
      });
      setOk(`Reprogramada para ${formatAgenda(nueva.toISOString())}`);
      setOpen(false);
      onDone?.();
    } catch (e) {
      setError(formatApiError(e, "No se pudo reprogramar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          fontSize: 13,
          color: "var(--text-secondary)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          <EventOutlinedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
          <span>
            Programada: <strong style={{ color: "inherit" }}>{formatAgenda(fechaActual)}</strong>
          </span>
        </span>
        {!open ? (
          <button type="button" onClick={abrir} style={btn}>
            Cambiar fecha y hora
          </button>
        ) : null}
      </div>
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
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 650, color: "var(--text-secondary)" }}>
              Día
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={input} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 650, color: "var(--text-secondary)" }}>
              Hora
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={input} />
            </label>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 650, color: "var(--text-secondary)" }}>
            Motivo (opcional)
            <textarea
              rows={2}
              maxLength={500}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. El cliente pidió cambiar la visita"
              style={{ ...input, minHeight: 64, resize: "vertical" }}
            />
          </label>
          {error ? <div style={{ fontSize: 12.5, color: "#b91c1c" }}>{error}</div> : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={saving}
              style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Guardando…" : "Guardar nueva fecha"}
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
