"use client";

import { useEffect, useState } from "react";
import { formatoMinutos } from "@/lib/actividad-tiempos";
import { formatApiError } from "@/lib/erp-api";
import { tiempoCalculado, type TiempoCalculado } from "@/lib/my-activities-api";
import s from "./TiempoEstandarCampo.module.css";

/** Espera mientras se escribe el título antes de pedir el cálculo. */
const ESPERA_MS = 700;

const horaCorta = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/**
 * Autoasignación (Adam, 29-10): el tiempo, la complejidad y la hora de entrega no se eligen, salen
 * del título. La misma tarjeta del tiempo estándar, en solo lectura, con lo que se va a guardar; la
 * API lo vuelve a calcular al crear, así que lo que se ve es lo que queda.
 */
export default function TiempoFijoCampo({
  token,
  titulo,
  indicaciones,
  coreKind,
  ticketType,
  ticketTypeCustom,
  fechaInicio,
  periodoFin,
  onMinutos,
}: {
  token: string;
  titulo: string;
  indicaciones?: string | null;
  coreKind: string;
  ticketType?: string | null;
  ticketTypeCustom?: string | null;
  /** ISO del inicio (día y hora del formulario); null si aún no hay día. */
  fechaInicio: string | null;
  periodoFin?: string | null;
  onMinutos?: (minutos: number) => void;
}) {
  const [dato, setDato] = useState<TiempoCalculado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listo = titulo.trim().length >= 3;

  useEffect(() => {
    if (!token || !listo) {
      setDato(null);
      return;
    }
    const control = new AbortController();
    const t = setTimeout(() => {
      setCargando(true);
      setError(null);
      tiempoCalculado(
        token,
        {
          titulo: titulo.trim(),
          indicaciones: indicaciones?.trim() || null,
          coreKind,
          ticketType: ticketType ?? null,
          ticketTypeCustom: ticketTypeCustom ?? null,
          fechaInicio,
          periodoInicio: periodoFin && fechaInicio ? fechaInicio.slice(0, 10) : null,
          periodoFin: periodoFin || null,
        },
        control.signal,
      )
        .then((r) => {
          setDato(r);
          onMinutos?.(r.tiempoEstandarMin);
        })
        .catch((e) => {
          if (!control.signal.aborted) setError(formatApiError(e, "No se pudo calcular el tiempo."));
        })
        .finally(() => {
          if (!control.signal.aborted) setCargando(false);
        });
    }, ESPERA_MS);
    return () => {
      clearTimeout(t);
      control.abort();
    };
    // onMinutos cambia en cada render del formulario: no debe volver a pedir el cálculo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, listo, titulo, indicaciones, coreKind, ticketType, ticketTypeCustom, fechaInicio, periodoFin]);

  return (
    <section className={s.tarjeta} aria-label="Tiempo fijo de la autoasignación" aria-busy={cargando}>
      <span className={s.tarjetaT}>Tiempo estándar · fijo en la autoasignación</span>
      <span className={s.total}>{dato ? formatoMinutos(dato.tiempoEstandarMin) : "—"}</span>
      {dato?.desglose.length ? (
        <dl className={s.desglose}>
          {dato.desglose.map((d) => (
            <div key={d.concepto} className={s.renglon}>
              <dt>{d.concepto}</dt>
              <dd>{formatoMinutos(d.minutos)}</dd>
            </div>
          ))}
          {dato.fechaEntregaEsperada ? (
            <div className={s.renglon}>
              <dt>Entregar a más tardar</dt>
              <dd>{horaCorta(dato.fechaEntregaEsperada)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {dato?.supuestos.length ? <span className={s.faltan}>Supuesto: {dato.supuestos.join("; ")}.</span> : null}
      <span className={s.tarjetaT}>
        {!listo
          ? "Escribe el título: el tiempo y la hora de entrega salen de ahí."
          : cargando
            ? "Calculando con el título…"
            : error ?? "Sale del título y no se edita. Si hace falta otro tiempo, lo ajusta tu superior."}
      </span>
    </section>
  );
}
