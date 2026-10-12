"use client";

import MicNoneOutlinedIcon from "@mui/icons-material/MicNoneOutlined";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import { useDictado } from "@/lib/use-dictado";
import s from "./DictadoBoton.module.css";

/**
 * Botón de micrófono: dicta y va agregando cada frase con `onTexto`.
 * Si el navegador no reconoce voz, no se muestra.
 */
export default function DictadoBoton({ onTexto, disabled }: { onTexto: (frase: string) => void; disabled?: boolean }) {
  const { soportado, escuchando, parcial, error, iniciar, detener } = useDictado(onTexto);
  if (!soportado) return null;
  return (
    <span className={s.envoltura}>
      <button
        type="button"
        className={s.boton}
        data-activo={escuchando ? "true" : undefined}
        onClick={escuchando ? detener : iniciar}
        disabled={disabled && !escuchando}
        aria-pressed={escuchando}
        aria-label={escuchando ? "Detener dictado" : "Dictar por voz"}
        title={escuchando ? "Detener dictado" : "Dictar por voz"}
      >
        {escuchando ? <StopCircleOutlinedIcon fontSize="small" /> : <MicNoneOutlinedIcon fontSize="small" />}
        <span>{escuchando ? "Detener" : "Dictar"}</span>
      </button>
      {escuchando ? (
        <span className={s.oyendo} aria-live="polite">
          {parcial ? `«${parcial}»` : "Escuchando…"}
        </span>
      ) : null}
      {error ? (
        <span className={s.error} role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
