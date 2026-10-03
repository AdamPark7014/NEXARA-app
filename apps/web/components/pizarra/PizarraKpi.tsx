"use client";

import type { CSSProperties } from "react";
import { Badge, DateInput, Progress, Segmented, type Tone } from "@/components/base";
import {
  PRIORIDAD_LABELS,
  RANGO_LABELS,
  SEMAFORO_LABELS,
  fechaMx,
  formatMinutes,
  formatPct,
  rangoDePreset,
  type BoardKpis,
  type BoardRange,
  type Prioridad,
  type RangoPreset,
  type Semaforo,
} from "@/lib/team-board-api";
import { PRIORIDAD_TONE, SEMAFORO_TONE } from "./tonos";
import k from "./PizarraKpi.module.css";

const CLASE_SEMAFORO: Record<Semaforo, string> = {
  rojo: k.dotRojo,
  amarillo: k.dotAmarillo,
  verde: k.dotVerde,
};

/** Punto del semáforo de una actividad (rojo/amarillo/verde del contrato). */
export function SemaforoDot({ semaforo, size = 9 }: { semaforo?: Semaforo; size?: number }) {
  if (!semaforo) return null;
  // El tamaño solo viaja como variable si no es el de siempre.
  const medida = size !== 9 ? ({ "--dot": `${size}px` } as CSSProperties) : undefined;
  return (
    <span
      className={[k.dot, CLASE_SEMAFORO[semaforo]].join(" ")}
      title={SEMAFORO_LABELS[semaforo]}
      aria-label={SEMAFORO_LABELS[semaforo]}
      role="img"
      style={medida}
    />
  );
}

/** Insignia del semáforo con su texto («Atrasada», «Por vencer», «En tiempo»). */
export function SemaforoBadge({ semaforo, label }: { semaforo?: Semaforo; label?: string }) {
  if (!semaforo) return null;
  return (
    <Badge size="sm" dot tone={SEMAFORO_TONE[semaforo]}>
      {label ?? SEMAFORO_LABELS[semaforo]}
    </Badge>
  );
}

/** Etiqueta de prioridad ya normalizada (ALTA/MEDIA/BAJA). */
export function PrioridadChip({ prioridad }: { prioridad?: Prioridad }) {
  if (!prioridad) return null;
  return (
    <Badge size="sm" tone={PRIORIDAD_TONE[prioridad]} title={`Prioridad ${PRIORIDAD_LABELS[prioridad]}`}>
      {PRIORIDAD_LABELS[prioridad]}
    </Badge>
  );
}

/** Tono de un porcentaje de KPI: ≥ 85 bien, ≥ 60 en riesgo, menos es rojo. */
function tonoPct(valor: number | null | undefined): Tone {
  if (valor == null || !Number.isFinite(valor)) return "neutral";
  if (valor >= 85) return "success";
  if (valor >= 60) return "warning";
  return "danger";
}

function Medidor({ label, valor, hint }: { label: string; valor: number | null | undefined; hint: string }) {
  const pct = valor == null || !Number.isFinite(valor) ? null : Math.max(0, Math.min(100, Math.round(valor)));
  return (
    <div className={k.medidor} title={hint}>
      <div className={k.medidorCabeza}>
        <span className={k.medidorEtiqueta}>{label}</span>
        <span className={k.medidorCifra}>{formatPct(valor)}</span>
      </div>
      <Progress value={pct ?? 0} max={100} tone={tonoPct(valor)} ariaLabel={`${label}: ${formatPct(valor)}`} />
      <span className={k.medidorPista}>{hint}</span>
    </div>
  );
}

/**
 * KPI del contrato C: a tiempo, eficiencia y productividad como barras, más
 * cerradas/asignadas y rechazadas. En `compacta` se omiten las pistas.
 */
export function KpiStrip({ kpis, compacta = false }: { kpis?: BoardKpis; compacta?: boolean }) {
  if (!kpis) return null;
  return (
    <div className={[k.kpis, compacta ? k.compacta : ""].filter(Boolean).join(" ")}>
      <Medidor
        label="A tiempo"
        valor={kpis.aTiempoPct}
        hint={`${kpis.aTiempo} de ${kpis.cerradas} cerradas dentro de su fecha máxima`}
      />
      <Medidor
        label="Eficiencia"
        valor={kpis.eficienciaPct}
        hint={`Plan ${formatMinutes(kpis.minutosPlan)} contra real ${formatMinutes(kpis.minutosReales)}`}
      />
      <Medidor
        label="Productividad"
        valor={kpis.productividadPct}
        hint={`${formatMinutes(kpis.minutosEnActividad)} productivas de ${formatMinutes(kpis.minutosAsistidos)} trabajadas`}
      />
      <div className={k.conteos}>
        <Badge tone="brand" title="Cerradas de las asignadas en el rango">
          {kpis.cerradas}/{kpis.asignadas} cerradas
        </Badge>
        {kpis.rechazadas > 0 ? (
          <Badge tone="danger" title="Actividades que rechazó con motivo">
            {kpis.rechazadas} rechazada{kpis.rechazadas > 1 ? "s" : ""}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

const PRESETS: RangoPreset[] = ["hoy", "semana", "mes", "personalizado"];

/** Hoy / Semana / Mes / personalizado (control segmentado). Lo elegido viaja como `desde`/`hasta`. */
export function RangoSelector({
  preset,
  rango,
  onChange,
}: {
  preset: RangoPreset;
  rango: BoardRange;
  onChange: (preset: RangoPreset, rango: BoardRange) => void;
}) {
  const hoy = fechaMx();
  return (
    <div className={k.rango}>
      <Segmented
        ariaLabel="Rango de fechas"
        items={PRESETS.map((p) => ({ id: p, label: RANGO_LABELS[p] }))}
        value={preset}
        onChange={(p) =>
          onChange(
            p,
            p === "personalizado" ? { desde: rango.desde ?? hoy, hasta: rango.hasta ?? hoy } : rangoDePreset(p, hoy),
          )
        }
      />
      {preset === "personalizado" ? (
        <div className={k.fechas}>
          <DateInput
            aria-label="Desde"
            controlSize="sm"
            value={rango.desde ?? hoy}
            max={rango.hasta ?? hoy}
            onChange={(e) => onChange("personalizado", { ...rango, desde: e.target.value })}
          />
          <span className={k.a} aria-hidden="true">
            a
          </span>
          <DateInput
            aria-label="Hasta"
            controlSize="sm"
            value={rango.hasta ?? hoy}
            min={rango.desde ?? undefined}
            onChange={(e) => onChange("personalizado", { ...rango, hasta: e.target.value })}
          />
        </div>
      ) : null}
    </div>
  );
}
