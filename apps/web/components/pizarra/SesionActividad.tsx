"use client";

import { useId, useState } from "react";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import CheckIcon from "@mui/icons-material/Check";
import { Alert, Button, Textarea } from "@/components/base";
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
import c from "./comun.module.css";
import s from "./SesionActividad.module.css";

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
      <div className={c.pila}>
        <Alert
          tone="warning"
          icon={<PauseCircleOutlineIcon />}
          title="En pausa"
          action={
            <Button
              variant="primary"
              className={c.tap}
              iconStart={<PlayCircleOutlineIcon />}
              loading={guardando}
              onClick={() => void correr(() => reanudarMiActividad(token, activityId), "No se pudo reanudar la actividad")}
            >
              {guardando ? "Reanudando…" : "Reanudar actividad"}
            </Button>
          }
        >
          <span className={s.texto}>{textoPausa(actividad, { miId, propia: true })}</span>
          <span className={s.ayuda}>
            Tu reloj vuelve a correr. Se detiene al pausar, al checar salida, a las 12 h o al terminar el día.
          </span>
        </Alert>
        {error ? (
          <p className={c.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (!puedePausar(actividad)) return null;

  const desde = hora(actividad.sesionAbiertaDesde);
  return (
    <div className={c.pila}>
      <div className={c.fila}>
        <Button
          className={c.tap}
          iconStart={<PauseCircleOutlineIcon />}
          loading={guardando}
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
          {guardando ? "Pausando…" : "Pausar"}
        </Button>
        <span className={s.corriendo}>
          <span className={s.punto} aria-hidden="true" />
          {desde ? `Reloj corriendo desde las ${desde}.` : "Reloj corriendo."}
        </span>
      </div>
      {error ? (
        <p className={c.error} role="alert">
          {error}
        </p>
      ) : null}
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
  const campoId = useId();
  const ayudaId = useId();

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
    <div className={c.pila}>
      {!open ? (
        <div className={c.fila}>
          <Button
            className={c.tap}
            iconStart={<PauseCircleOutlineIcon />}
            onClick={() => {
              setOpen(true);
              setOk(null);
              setError(null);
            }}
          >
            Pausar
          </Button>
          <span className={c.pista}>Detiene su reloj para que atienda otra cosa; la actividad sigue abierta.</span>
        </div>
      ) : null}
      {ok && !open ? (
        <p className={c.ok} role="status">
          <CheckIcon aria-hidden="true" />
          <span>{ok}</span>
        </p>
      ) : null}
      {open ? (
        <div className={c.panel}>
          <div className={s.campo}>
            <label className={s.etiqueta} htmlFor={campoId}>
              ¿Por qué la pausas? <span className={s.req}>*</span>
            </label>
            <Textarea
              id={campoId}
              autoFocus
              rows={2}
              maxLength={MOTIVO_PAUSA_MAX}
              value={motivo}
              invalid={Boolean(error)}
              aria-describedby={ayudaId}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Salió una falla urgente en el cliente; que la atienda primero."
            />
            {error ? (
              <span id={ayudaId} className={c.error} role="alert">
                {error}
              </span>
            ) : (
              <span id={ayudaId} className={c.pista}>
                {Math.min(motivo.trim().length, MOTIVO_PAUSA_MIN)}/{MOTIVO_PAUSA_MIN} caracteres mínimo · la persona lo
                ve en su aviso.
              </span>
            )}
          </div>
          <div className={s.botones}>
            <Button variant="ghost" className={c.tap} onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" className={c.tap} loading={saving} onClick={() => void guardar()}>
              {saving ? "Pausando…" : "Pausar actividad"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
