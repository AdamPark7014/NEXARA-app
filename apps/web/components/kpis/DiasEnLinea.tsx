"use client";

import type { CSSProperties, ReactNode } from "react";
import { Badge } from "@/components/base";
import { fechaCorta, formatHoras, formatPctKpi, horaMx, type DiaKpi } from "@/lib/kpis-equipo";
import { bloquesDelDia, escalaDeDias, horasEnPalabras, type EscalaDias } from "@/lib/kpis-lectura";
import s from "./kpis.module.css";

const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:00`;

/** Lo que hay que saber de ese día, en insignias chicas. El uniforme correcto no se anuncia. */
function avisosDelDia(d: DiaKpi): ReactNode[] {
  const out: ReactNode[] = [];
  if (d.retardo) out.push(<Badge key="r" tone="warning">Retardo · {horasEnPalabras(d.minutosTarde)}</Badge>);
  if (d.conJornada && d.uniformeOk === false) out.push(<Badge key="u" tone="danger">Sin uniforme</Badge>);
  if (d.conJornada && d.uniformeOk == null) {
    out.push(
      <Badge key="u" title="Márcalo en Asistencias, en la foto de entrada">
        Uniforme sin revisar
      </Badge>,
    );
  }
  if (d.abierta) out.push(<Badge key="a" tone="success" dot>En jornada</Badge>);
  if (d.sinSalida) {
    out.push(
      <Badge key="s" tone="warning" title="No checó salida: se contó hasta el cierre automático">
        Sin salida
      </Badge>,
    );
  }
  if (d.cierreAutomatico) out.push(<Badge key="c" tone="violet">Salida automática</Badge>);
  if (d.conJornada && d.actividadesFueraDeJornada) {
    out.push(
      <Badge key="o" tone="warning" title="Empezaron sin estar checado: no suman productividad">
        {d.actividadesFueraDeJornada === 1 ? "1 actividad sin checar entrada — no cuenta" : `${d.actividadesFueraDeJornada} actividades sin checar entrada — no cuentan`}
      </Badge>,
    );
  }
  if (!d.laborable && d.conJornada) out.push(<Badge key="d" tone="info">Día de descanso</Badge>);
  return out;
}

/** Día sin jornada: por qué no hay barra. */
function sinJornada(d: DiaKpi): ReactNode {
  if (d.faltaJustificada) return <Badge tone="violet">Falta justificada</Badge>;
  if (d.actividadesFueraDeJornada) {
    return (
      <Badge tone="warning">
        {d.actividadesFueraDeJornada === 1
          ? "Trabajó sin checar entrada: 1 actividad no cuenta"
          : `Trabajó sin checar entrada: ${d.actividadesFueraDeJornada} actividades no cuentan`}
      </Badge>
    );
  }
  if (d.sinChecada) return <Badge tone="danger">Sin checada: no registró entrada</Badge>;
  return <span className={s.sinJornada}>Aún sin entrada</span>;
}

function Pista({ d, escala }: { d: DiaKpi; escala: EscalaDias }) {
  const bloques = bloquesDelDia(d, escala);
  const paso = 100 / Math.max(1, escala.horas.length - 1);
  const clase = { jornada: s.bloqueJornada, comida: s.bloqueComida, productivo: s.bloqueProductivo } as const;
  return (
    <div
      className={s.pista}
      style={{ "--paso-hora": `${paso}%` } as CSSProperties}
      role="img"
      aria-label={`Jornada del ${fechaCorta(d.fecha)}: ${bloques
        .filter((b) => b.tipo !== "jornada")
        .map((b) => `${b.tipo === "productivo" ? "en actividad" : "comida"} ${horaMx(b.inicio)}–${horaMx(b.fin)}`)
        .join(", ")}`}
    >
      {bloques.map((b) => {
        const nombres = (b.actividades ?? []).map((a) => [a.anNumber, a.titulo].filter(Boolean).join(" "));
        const titulo =
          b.tipo === "productivo"
            ? `${horaMx(b.inicio)}–${horaMx(b.fin)} · ${nombres.join(" + ") || "Actividad"}`
            : b.tipo === "comida"
              ? `Comida ${horaMx(b.inicio)}–${horaMx(b.fin)} (no cuenta como jornada)`
              : `Jornada ${horaMx(b.inicio)}–${horaMx(b.fin)}`;
        return (
          <span
            key={`${b.tipo}-${b.inicio}`}
            className={`${s.bloque} ${clase[b.tipo]}`}
            title={titulo}
            style={{ left: `${b.izquierdaPct}%`, width: `${Math.max(b.anchoPct, 0.5)}%` }}
          >
            {b.tipo === "productivo" && b.anchoPct > 9 ? b.actividades?.[0]?.anNumber ?? "" : ""}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Día por día sobre una misma regla de horas: la jornada (entrada → salida) en gris,
 * el tiempo en actividades en teal (al pasar el cursor dice qué actividad), la comida rayada
 * y lo que queda vacío es tiempo sin actividad.
 */
export default function DiasEnLinea({ dias }: { dias: DiaKpi[] }) {
  const escala = escalaDeDias(dias);
  return (
    <div>
      {escala ? (
        <div className={s.regla} aria-hidden="true">
          <div className={s.reglaHoras}>
            {escala.horas.map((h, i) => (
              <span
                key={h}
                className={`${s.reglaHora} ${i % 2 ? s.horaImpar : ""}`}
                style={{ left: `${((h - escala.desde) / (escala.hasta - escala.desde)) * 100}%` }}
              >
                {hhmm(h)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {dias.map((d) => {
        const avisos = avisosDelDia(d);
        return (
          <div key={d.fecha} className={s.dia}>
            <div className={s.diaEtiqueta}>
              <span className={s.diaFecha}>{fechaCorta(d.fecha)}</span>
              {d.conJornada ? (
                <span className={s.diaHoras}>
                  {horaMx(d.entrada)} → {d.salida ? horaMx(d.salida) : d.abierta ? "ahora" : "sin salida"}
                </span>
              ) : null}
            </div>
            <div className={s.diaPista}>
              {d.conJornada && escala ? <Pista d={d} escala={escala} /> : sinJornada(d)}
              {avisos.length ? <div className={s.chips}>{avisos}</div> : null}
            </div>
            <div className={s.diaResumen}>
              {d.conJornada ? (
                <>
                  <span className={s.diaPct}>{formatPctKpi(d.productividadPct)}</span>
                  <span className={s.diaSub}>
                    {formatHoras(d.minutosProductivos)} de {formatHoras(d.minutosLaborados)}
                  </span>
                </>
              ) : (
                <span className={s.diaSub}>—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
