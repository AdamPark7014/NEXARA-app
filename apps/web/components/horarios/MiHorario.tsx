"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, SkeletonRows } from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import {
  diaLargo,
  formatearRangoHorario,
  hoyMx,
  miHorario,
  minutosAHorasTexto,
  sumarDias,
  type DiaMio,
  type MiHorario as Datos,
} from "@/lib/horarios-api";
import s from "./horarios.module.css";

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Mexico_City" }).format(new Date(iso));
const mayuscula = (t: string) => t.charAt(0).toLocaleUpperCase("es") + t.slice(1);

/** «Extendido por Luis: cerrar rack» */
export function quienYPorQue(d: Pick<DiaMio, "programado" | "ajuste" | "loPuso" | "horario">): string | null {
  if (!d.programado) return null;
  const que = d.ajuste === "extender" ? "Extendido" : d.ajuste === "recortar" ? "Recortado" : "Programado";
  return `${que}${d.loPuso ? ` por ${d.loPuso}` : ""}${d.horario.motivo ? `: ${d.horario.motivo}` : ""}`;
}

/** Mi horario: hoy y los próximos días. */
export default function MiHorario({ token }: { token: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const hoy = hoyMx();
      setDatos(await miHorario(token, hoy, sumarDias(hoy, 7)));
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar tu horario."));
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (error && !datos) {
    return (
      <Alert
        tone="danger"
        role="alert"
        title="No se pudo cargar tu horario"
        action={
          <Button size="sm" onClick={() => void cargar()}>
            Reintentar
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }
  if (!datos) return <SkeletonRows rows={5} label="Cargando tu horario" />;

  const [primero, ...resto] = datos.dias;
  return (
    <div className={s.pila}>
      <Card aria-label="Hoy">
        <div className={s.hoyTarjeta}>
          <span className={s.meta}>Hoy, {diaLargo(primero.fecha)}</span>
          <p className={s.grande}>
            {primero.trabaja ? `${primero.horario.horaEntrada} a ${primero.horario.horaSalida}` : "Descansas"}
          </p>
          {quienYPorQue(primero) ? <p className={s.nota}>{quienYPorQue(primero)}</p> : null}
          <p className={s.nota}>
            {datos.entradaHoyAt ? `Entraste ${hora(datos.entradaHoyAt)}. ` : ""}
            {primero.extraMin ? `Extra prevista: ${minutosAHorasTexto(primero.extraMin)}, por autorizar.` : ""}
          </p>
        </div>
      </Card>
      <Card aria-label="Próximos días">
        <ul className={s.lista}>
          {resto.map((d) => (
            <li key={d.fecha}>
              <span>
                {mayuscula(diaLargo(d.fecha))}
                {quienYPorQue(d) ? <span className={s.meta}>{quienYPorQue(d)}</span> : null}
              </span>
              <span>{d.trabaja ? formatearRangoHorario(d.horario.horaEntrada, d.horario.horaSalida) : "Descansas"}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
