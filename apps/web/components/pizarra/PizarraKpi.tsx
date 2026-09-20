"use client";

import type { CSSProperties } from "react";
import { Segmented, fieldClass } from "@/components/base";
import {
  PRIORIDAD_COLORS,
  PRIORIDAD_LABELS,
  RANGO_LABELS,
  SEMAFORO_COLORS,
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

/** Punto del semáforo de una actividad (rojo/amarillo/verde del contrato). */
export function SemaforoDot({ semaforo, size = 9 }: { semaforo?: Semaforo; size?: number }) {
  if (!semaforo) return null;
  const color = SEMAFORO_COLORS[semaforo];
  return (
    <span
      title={SEMAFORO_LABELS[semaforo]}
      aria-label={SEMAFORO_LABELS[semaforo]}
      style={{
        display: "inline-block",
        flex: "0 0 auto",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
      }}
    />
  );
}

export function Chip({
  children,
  color,
  title,
  style,
}: {
  children: React.ReactNode;
  color: string;
  title?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1.2,
        padding: "3px 7px",
        borderRadius: 999,
        color,
        background: `color-mix(in srgb, ${color} 11%, transparent)`,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Etiqueta de prioridad ya normalizada (ALTA/MEDIA/BAJA). */
export function PrioridadChip({ prioridad }: { prioridad?: Prioridad }) {
  if (!prioridad) return null;
  return (
    <Chip color={PRIORIDAD_COLORS[prioridad]} title={`Prioridad ${PRIORIDAD_LABELS[prioridad]}`}>
      {PRIORIDAD_LABELS[prioridad]}
    </Chip>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ minWidth: 0, textAlign: "center" }} title={hint}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.01em" }}>{value}</div>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 650,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          color: "var(--text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
    </div>
  );
}

/**
 * Tira de KPI del contrato C: a tiempo, eficiencia, productividad, cerradas/asignadas
 * y rechazadas. En `compacta` cabe dentro de la tarjeta de una persona.
 */
export function KpiStrip({ kpis, compacta = false }: { kpis?: BoardKpis; compacta?: boolean }) {
  if (!kpis) return null;
  return (
    <div style={{ width: "100%", display: "grid", gap: 6 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: compacta ? 4 : 10,
          padding: compacta ? "8px 4px" : "12px 8px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--border) 16%, var(--surface))",
        }}
      >
        <Kpi
          label="A tiempo"
          value={formatPct(kpis.aTiempoPct)}
          hint={`${kpis.aTiempo} de ${kpis.cerradas} cerradas dentro de su fecha máxima`}
        />
        <Kpi
          label="Eficiencia"
          value={formatPct(kpis.eficienciaPct)}
          hint={`Plan ${formatMinutes(kpis.minutosPlan)} contra real ${formatMinutes(kpis.minutosReales)}`}
        />
        <Kpi
          label="Productividad"
          value={formatPct(kpis.productividadPct)}
          hint={`${formatMinutes(kpis.minutosEnActividad)} en actividad de ${formatMinutes(kpis.minutosAsistidos)} asistidos`}
        />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
        <Chip color="var(--primary)" title="Cerradas de las asignadas en el rango">
          {kpis.cerradas}/{kpis.asignadas} cerradas
        </Chip>
        {kpis.rechazadas > 0 ? (
          <Chip color="#dc2626" title="Actividades que rechazó con motivo">
            {kpis.rechazadas} rechazada{kpis.rechazadas > 1 ? "s" : ""}
          </Chip>
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <input
            type="date"
            aria-label="Desde"
            className={fieldClass}
            value={rango.desde ?? hoy}
            max={rango.hasta ?? hoy}
            onChange={(e) => onChange("personalizado", { ...rango, desde: e.target.value })}
          />
          <span style={{ fontSize: 12, color: "var(--ui-fg-3)" }}>a</span>
          <input
            type="date"
            aria-label="Hasta"
            className={fieldClass}
            value={rango.hasta ?? hoy}
            min={rango.desde ?? undefined}
            onChange={(e) => onChange("personalizado", { ...rango, hasta: e.target.value })}
          />
        </div>
      ) : null}
    </div>
  );
}
