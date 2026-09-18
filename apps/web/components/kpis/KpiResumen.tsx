"use client";

import KpiCard, { type KpiVariant } from "@/components/ui/KpiCard";
import {
  SEMAFORO_KPI_COLORS,
  SEMAFORO_KPI_LABELS,
  formatHoras,
  formatPctKpi,
  uniformeTexto,
  type SemaforoKpi,
  type TotalesKpi,
} from "@/lib/kpis-equipo";

/** Mismos cortes que el semáforo de la API (`UMBRALES_KPI`). */
function variantePct(v: number | null, verde: number, amarillo: number): KpiVariant {
  if (v == null) return "default";
  if (v >= verde) return "positive";
  if (v >= amarillo) return "warning";
  return "danger";
}

/** Tira de KPI: la misma para el equipo y para una persona. */
export default function KpiResumen({ totales }: { totales: TotalesKpi }) {
  const t = totales;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 10,
      }}
    >
      <KpiCard
        label="Retardos"
        value={t.retardos}
        hint={t.retardos ? `${formatHoras(t.minutosTarde)} tarde en total` : "Todos a tiempo"}
        variant={t.retardos >= 3 ? "danger" : t.retardos >= 1 ? "warning" : t.diasConJornada ? "positive" : "default"}
      />
      <KpiCard
        label="Uniforme"
        value={formatPctKpi(t.uniforme.pct)}
        hint={uniformeTexto(t.uniforme)}
        variant={variantePct(t.uniforme.pct, 95, 80)}
      />
      <KpiCard label="Horas laboradas" value={formatHoras(t.minutosLaborados)} hint={`${t.diasConJornada} día(s) con jornada`} />
      <KpiCard
        label="Horas productivas"
        value={formatHoras(t.minutosProductivos)}
        hint={`${formatPctKpi(t.productividadPct)} de lo laborado`}
        variant={variantePct(t.productividadPct, 70, 50)}
      />
      <KpiCard
        label="Inactividad"
        value={formatHoras(t.minutosInactivos)}
        hint="Laborado sin actividad en curso"
      />
      <KpiCard
        label="Tiempo extra"
        value={t.minutosExtra == null ? "—" : formatHoras(t.minutosExtra)}
        hint={t.minutosExtra == null ? "Sin horario fijo" : "Arriba de 8 h o en día de descanso"}
        variant={t.minutosExtra ? "accent" : "default"}
      />
      {t.diasSinChecada || t.faltasJustificadas ? (
        <KpiCard
          label="Días sin checada"
          value={t.diasSinChecada}
          hint={t.faltasJustificadas ? `${t.faltasJustificadas} falta(s) justificada(s) aparte` : "Laborables ya pasados"}
          variant={t.diasSinChecada >= 2 ? "danger" : t.diasSinChecada ? "warning" : "default"}
        />
      ) : null}
    </div>
  );
}

/** Punto + etiqueta del semáforo; los motivos van en el `title`. */
export function SemaforoKpiChip({
  semaforo,
  motivos = [],
  compacto = false,
}: {
  semaforo: SemaforoKpi;
  motivos?: string[];
  compacto?: boolean;
}) {
  const color = SEMAFORO_KPI_COLORS[semaforo];
  const texto = SEMAFORO_KPI_LABELS[semaforo];
  return (
    <span
      title={motivos.length ? motivos.join(" · ") : texto}
      {...(compacto ? { role: "img", "aria-label": `Semáforo: ${texto}` } : {})}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11.5,
        fontWeight: 700,
        color,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 22%, transparent)`,
          flex: "0 0 auto",
        }}
      />
      {compacto ? null : texto}
    </span>
  );
}
