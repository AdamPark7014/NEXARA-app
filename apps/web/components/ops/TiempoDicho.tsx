"use client";

/**
 * Tarjeta «Tiempo» · cuánto tomó de verdad (Velocidad Core, Ola 4). Quien la ejecutó confirma el reloj o
 * dice otro tiempo; es opcional y una sola vez. No cambia el reloj, ni KPIs ni nómina: solo enseña a los
 * tiempos que se sugieren después, porque muchos relojes corren hasta que acaba el día.
 */
import { useState } from "react";
import { formatoMinutos } from "@/lib/actividad-tiempos";
import { formatApiError } from "@/lib/erp-api";
import { decirTiempoActividad } from "@/lib/ops-activities-api";
import s from "./TiempoActividad.module.css";

export default function TiempoDicho({
  token,
  activityId,
  relojMin,
  dichoMin,
  preguntar,
  soyQuienEjecuta,
}: {
  token: string;
  activityId: number;
  relojMin?: number | null;
  dichoMin?: number | null;
  preguntar?: boolean;
  soyQuienEjecuta: boolean;
}) {
  const [dicho, setDicho] = useState<number | null>(dichoMin ?? null);
  const [otro, setOtro] = useState(false);
  const [horas, setHoras] = useState("");
  const [minutos, setMinutos] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dicho != null) {
    return (
      <p className={s.pie}>
        {soyQuienEjecuta ? "Dijiste" : "Quien la ejecutó dijo"} que tomó {formatoMinutos(dicho)}
      </p>
    );
  }
  if (!preguntar || !soyQuienEjecuta) return null;

  const reloj = Math.max(0, Math.round(relojMin ?? 0));
  const escrito = (Number(horas) || 0) * 60 + (Number(minutos) || 0);
  const guardar = async (valor: number) => {
    setGuardando(true);
    setError(null);
    try {
      const r = await decirTiempoActividad(token, activityId, valor);
      setDicho(r.tiempoDichoMin);
    } catch (e) {
      setError(formatApiError(e, "No se pudo guardar. Intenta de nuevo."));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={s.pregunta}>
      <p className={s.preguntaTexto}>
        ¿Te tomó {formatoMinutos(reloj)}? <span className={s.pie}>Así mejoran los tiempos que se sugieren.</span>
      </p>
      {otro ? (
        <div className={s.preguntaFila}>
          <label className={s.preguntaCampo}>
            <input inputMode="numeric" value={horas} onChange={(e) => setHoras(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-label="Horas" />h
          </label>
          <label className={s.preguntaCampo}>
            <input inputMode="numeric" value={minutos} onChange={(e) => setMinutos(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="Minutos" />min
          </label>
          <button type="button" className={s.preguntaBoton} disabled={guardando || escrito < 1} onClick={() => void guardar(escrito)}>
            Guardar
          </button>
        </div>
      ) : (
        <div className={s.preguntaFila}>
          <button type="button" className={s.preguntaBoton} disabled={guardando} onClick={() => void guardar(reloj)}>
            Sí
          </button>
          <button type="button" className={s.preguntaSecundario} disabled={guardando} onClick={() => setOtro(true)}>
            Fue otro tiempo
          </button>
        </div>
      )}
      {error ? <p className={s.preguntaError} role="alert">{error}</p> : null}
    </div>
  );
}
