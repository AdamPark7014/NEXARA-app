"use client";

import { useEffect, useState } from "react";
import MicNoneOutlinedIcon from "@mui/icons-material/MicNoneOutlined";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import { useUser } from "@/components/UserContext";
import { useDictado } from "@/lib/use-dictado";
import { useGrabadora } from "@/lib/use-grabadora";
import { duracionLegible, transcribirDictado, vozPropiaDisponible } from "@/lib/voz-api";
import s from "./DictadoBoton.module.css";

/** Un dictado son instrucciones o notas: a los 2 minutos se corta solo. */
const MAX_DICTADO_MS = 2 * 60_000;

/** El transcriptor devolvió vacío. */
const MENSAJE_NO_ENTENDIO = "No se entendió nada; habla más cerca del micrófono.";

/**
 * Botón de micrófono: dicta y entrega el texto con `onTexto`.
 *
 * Si el servidor tiene transcriptor propio (whisper), graba, sube el audio y pone el texto
 * al detener: la voz no sale de NEXARA. Si no, usa el reconocimiento del navegador, que
 * escribe mientras hablas. Si no hay ninguno de los dos, no se muestra.
 */
export default function DictadoBoton({ onTexto, disabled }: { onTexto: (frase: string) => void; disabled?: boolean }) {
  const { token } = useUser();
  const [propia, setPropia] = useState(false);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    vozPropiaDisponible(token).then((ok) => vivo && setPropia(ok));
    return () => {
      vivo = false;
    };
  }, [token]);

  return propia && token ? (
    <DictadoPropio token={token} onTexto={onTexto} disabled={disabled} />
  ) : (
    <DictadoNavegador onTexto={onTexto} disabled={disabled} />
  );
}

function DictadoPropio({ token, onTexto, disabled }: { token: string; onTexto: (t: string) => void; disabled?: boolean }) {
  const [pasando, setPasando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  const { soportado, grabando, transcurrido, error, iniciar, detener } = useGrabadora({
    maxMs: MAX_DICTADO_MS,
    onParte: (audio) => {
      setPasando(true);
      setFalla(null);
      transcribirDictado(token, audio)
        .then((texto) => {
          if (texto.trim()) onTexto(texto);
          else setFalla(MENSAJE_NO_ENTENDIO);
        })
        .catch((e) => setFalla(e instanceof Error ? e.message : "No se pudo pasar a texto."))
        .finally(() => setPasando(false));
    },
  });
  if (!soportado) return null;
  const visible = error ?? falla;
  const reintentar = () => {
    setFalla(null);
    void iniciar();
  };
  return (
    <Vista
      activo={grabando}
      onClick={grabando ? detener : reintentar}
      disabled={(disabled && !grabando) || pasando}
      estado={
        grabando
          ? `Grabando ${duracionLegible(transcurrido)} · al detener se pasa a texto`
          : pasando
            ? "Pasando a texto…"
            : null
      }
      error={visible}
      onReintentar={!grabando && !pasando && visible === MENSAJE_NO_ENTENDIO ? reintentar : undefined}
    />
  );
}

function DictadoNavegador({ onTexto, disabled }: { onTexto: (t: string) => void; disabled?: boolean }) {
  const { soportado, escuchando, parcial, error, iniciar, detener } = useDictado(onTexto);
  if (!soportado) return null;
  return (
    <Vista
      activo={escuchando}
      onClick={escuchando ? detener : iniciar}
      disabled={disabled && !escuchando}
      estado={escuchando ? (parcial ? `«${parcial}»` : "Escuchando…") : null}
      error={error}
    />
  );
}

function Vista({
  activo,
  onClick,
  disabled,
  estado,
  error,
  onReintentar,
}: {
  activo: boolean;
  onClick: () => void;
  disabled?: boolean;
  estado: string | null;
  error: string | null;
  /** Solo cuando el audio no se entendió: vuelve a abrir el micrófono. */
  onReintentar?: () => void;
}) {
  return (
    <span className={s.envoltura}>
      <button
        type="button"
        className={s.boton}
        data-activo={activo ? "true" : undefined}
        onClick={onClick}
        disabled={disabled}
        aria-pressed={activo}
        aria-label={activo ? "Detener dictado" : "Dictar por voz"}
        title={activo ? "Detener dictado" : "Dictar por voz"}
      >
        {activo ? <StopCircleOutlinedIcon fontSize="small" /> : <MicNoneOutlinedIcon fontSize="small" />}
        <span>{activo ? "Detener" : "Dictar"}</span>
      </button>
      {estado ? (
        <span className={s.oyendo} aria-live="polite">
          {estado}
        </span>
      ) : null}
      {error ? (
        <span className={s.error} role="alert">
          {error}
        </span>
      ) : null}
      {onReintentar ? (
        <button type="button" className={s.boton} onClick={onReintentar} disabled={disabled}>
          Reintentar
        </button>
      ) : null}
    </span>
  );
}
