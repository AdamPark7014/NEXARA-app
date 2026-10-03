"use client";

import { useState } from "react";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import { Button, type ButtonVariant } from "@/components/base";
import { iniciarMiActividad } from "@/lib/my-activities-api";
import { formatApiError } from "@/lib/erp-api";
import { ACCION_INICIAR } from "@/lib/actividad-tiempos";
import c from "./comun.module.css";

type Props = {
  token: string;
  activityId: number;
  onDone?: () => void;
  /**
   * Jerarquía del botón. Por defecto es la acción principal (ficha de la actividad);
   * en una lista solo la primera va en `primary` y las demás en `tonal`.
   */
  variant?: ButtonVariant;
};

/**
 * «Iniciar actividad»: la única acción de quien recibe una actividad.
 *
 * Regla del dueño (18-09): no se acepta ni se rechaza, únicamente se inicia. Al
 * tocarlo se guarda la hora real de inicio (el fin lo marca la foto de salida). Si
 * la persona no puede hacerla, lo habla con su jefe, que es quien la reasigna.
 * Quién lo ve lo decide `puedeIniciar()`.
 */
export default function IniciarActividad({ token, activityId, onDone, variant = "primary" }: Props) {
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
    <div className={c.pila}>
      <div className={c.fila}>
        <Button
          variant={variant}
          className={c.tap}
          iconStart={<PlayArrowRoundedIcon />}
          loading={guardando}
          onClick={() => void iniciar()}
        >
          {guardando ? "Iniciando…" : ACCION_INICIAR}
        </Button>
        <span className={c.pista}>Queda registrada tu hora real de inicio.</span>
      </div>
      {error ? (
        <p className={c.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
