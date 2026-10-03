"use client";

import { useId, useState } from "react";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import EditCalendarOutlinedIcon from "@mui/icons-material/EditCalendarOutlined";
import CheckIcon from "@mui/icons-material/Check";
import { Button, DateInput, Input, Textarea } from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import { reprogramarDespacho } from "@/lib/my-activities-api";
import c from "./comun.module.css";
import s from "./ReprogramarDespacho.module.css";

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
  const ids = useId();

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
    <div className={c.pila}>
      <div className={c.fila}>
        <span className={c.dato}>
          <EventOutlinedIcon aria-hidden="true" />
          <span className={c.tenue}>
            Programada: <strong className={s.fuerte}>{formatAgenda(fechaActual)}</strong>
          </span>
        </span>
        {!open ? (
          <Button size="sm" variant="ghost" className={c.tap} iconStart={<EditCalendarOutlinedIcon />} onClick={abrir}>
            Cambiar fecha y hora
          </Button>
        ) : null}
      </div>
      {ok && !open ? (
        <p className={c.ok} role="status">
          <CheckIcon aria-hidden="true" />
          <span>{ok}</span>
        </p>
      ) : null}
      {open ? (
        <div className={c.panel}>
          <div className={s.campos}>
            <label className={s.campo} htmlFor={`${ids}-dia`}>
              <span className={s.etiqueta}>Día</span>
              <DateInput id={`${ids}-dia`} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </label>
            <label className={s.campo} htmlFor={`${ids}-hora`}>
              <span className={s.etiqueta}>Hora</span>
              <Input id={`${ids}-hora`} type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </label>
          </div>
          <label className={s.campo} htmlFor={`${ids}-motivo`}>
            <span className={s.etiqueta}>
              Motivo <span className={s.opcional}>· opcional</span>
            </span>
            <Textarea
              id={`${ids}-motivo`}
              rows={2}
              maxLength={500}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. El cliente pidió cambiar la visita"
            />
          </label>
          {error ? (
            <p className={c.error} role="alert">
              {error}
            </p>
          ) : null}
          <div className={s.botones}>
            <Button variant="ghost" className={c.tap} onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" className={c.tap} loading={saving} onClick={() => void guardar()}>
              {saving ? "Guardando…" : "Guardar nueva fecha"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
