"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import { useUser } from "@/components/UserContext";
import { Chip, RangoSelector } from "@/components/pizarra/PizarraKpi";
import KpiResumen, { SemaforoKpiChip } from "@/components/kpis/KpiResumen";
import KpiLineaDeTiempo, { LeyendaTramos } from "@/components/kpis/KpiLineaDeTiempo";
import { formatApiError } from "@/lib/erp-api";
import { rangoDePreset, type BoardRange, type RangoPreset } from "@/lib/team-board-api";
import {
  KPIS_PATH,
  SEMAFORO_KPI_COLORS,
  fechaCorta,
  fetchKpisPersona,
  formatHoras,
  formatPctKpi,
  horaMx,
  rangoDesdeUrl,
  type DiaKpi,
  type KpisPersonaResponse,
} from "@/lib/kpis-equipo";

const ROJO = SEMAFORO_KPI_COLORS.rojo;
const AMBAR = SEMAFORO_KPI_COLORS.amarillo;
const VERDE = SEMAFORO_KPI_COLORS.verde;
const GRIS = SEMAFORO_KPI_COLORS.sin_datos;

function Dato({ etiqueta, valor, color }: { etiqueta: string; valor: ReactNode; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 650, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
        {etiqueta}
      </div>
      <div style={{ fontSize: 14, fontWeight: 750, fontVariantNumeric: "tabular-nums", color }}>{valor}</div>
    </div>
  );
}

/** Chips de lo que hay que mirar ese día. */
function chipsDelDia(d: DiaKpi): ReactNode[] {
  const out: ReactNode[] = [];
  if (d.retardo) out.push(<Chip key="r" color={AMBAR}>Retardo · {d.minutosTarde} min</Chip>);
  if (d.conJornada) {
    if (d.uniformeOk === true) out.push(<Chip key="u" color={VERDE}>Uniforme ✓</Chip>);
    else if (d.uniformeOk === false) out.push(<Chip key="u" color={ROJO}>Sin uniforme ✗</Chip>);
    else out.push(<Chip key="u" color={GRIS} title="Márcalo en Asistencias, en la foto de entrada">Uniforme sin revisar</Chip>);
  }
  if (d.abierta) out.push(<Chip key="a" color={VERDE}>En jornada</Chip>);
  if (d.sinSalida) out.push(<Chip key="s" color={AMBAR} title="Se contó hasta la hora del cierre automático">Sin salida</Chip>);
  if (d.cierreAutomatico) out.push(<Chip key="c" color="#7c3aed">Salida automática</Chip>);
  if (d.faltaJustificada) out.push(<Chip key="f" color="#7c3aed">Falta justificada</Chip>);
  if (d.sinChecada) out.push(<Chip key="n" color={ROJO}>Sin checada</Chip>);
  if (d.actividadesFueraDeJornada) {
    out.push(
      <Chip key="o" color={AMBAR} title="Actividades que empezaron sin estar checado">
        {d.actividadesFueraDeJornada} actividad(es) sin checar
      </Chip>,
    );
  }
  if (!d.laborable && d.conJornada) out.push(<Chip key="d" color="#0891b2">Día de descanso</Chip>);
  return out;
}

function FilaDia({ d }: { d: DiaKpi }) {
  const chips = chipsDelDia(d);
  return (
    <article
      style={{
        display: "grid",
        gap: 10,
        padding: "14px 16px",
        borderBottom: "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 14 }}>{fechaCorta(d.fecha)}</strong>
          {d.conJornada ? (
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {horaMx(d.entrada)} → {d.salida ? horaMx(d.salida) : d.abierta ? "ahora" : "sin salida"}
            </span>
          ) : null}
        </div>
        {chips.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{chips}</div> : null}
      </div>

      {d.conJornada ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 10 }}>
            <Dato etiqueta="Laborado" valor={formatHoras(d.minutosLaborados)} />
            <Dato etiqueta="Productivo" valor={formatHoras(d.minutosProductivos)} color={VERDE} />
            <Dato etiqueta="Inactivo" valor={formatHoras(d.minutosInactivos)} color={d.minutosInactivos ? AMBAR : undefined} />
            <Dato etiqueta="Productividad" valor={formatPctKpi(d.productividadPct)} />
            <Dato etiqueta="Comida" valor={d.minutosComida ? formatHoras(d.minutosComida) : "—"} />
            <Dato etiqueta="Extra" valor={d.minutosExtra == null ? "—" : d.minutosExtra ? formatHoras(d.minutosExtra) : "0"} />
          </div>
          <KpiLineaDeTiempo dia={d} />
          {d.actividades?.length ? (
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: 4 }}>
              {d.actividades.map((a) => (
                <li key={a.activityId} style={{ display: "flex", gap: 8, fontSize: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-tertiary)" }}>
                    {horaMx(a.inicio)}–{a.enCurso ? "…" : horaMx(a.fin)}
                  </span>
                  {a.anNumber ? (
                    <Link href={`/erp/actividades/${a.activityId}`} style={{ fontWeight: 650, color: "var(--primary)", textDecoration: "none" }}>
                      {a.anNumber}
                    </Link>
                  ) : null}
                  <span style={{ minWidth: 0 }}>{a.titulo ?? "Actividad"}</span>
                  <span style={{ color: "var(--text-tertiary)" }}>· {formatHoras(a.minutosEnJornada)} en jornada</span>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sin actividades con foto de entrada en su jornada.</div>
          )}
        </>
      ) : d.abierta === false && !d.sinChecada && !d.faltaJustificada && !d.actividadesFueraDeJornada ? (
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Aún sin entrada.</div>
      ) : null}
    </article>
  );
}

export default function KpisPersonaPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const params = useParams();
  const userId = Number(Array.isArray(params?.userId) ? params.userId[0] : params?.userId);

  const [preset, setPreset] = useState<RangoPreset>("semana");
  const [rango, setRango] = useState<BoardRange>(() => rangoDePreset("semana"));
  const [listo, setListo] = useState(false);
  const [data, setData] = useState<KpisPersonaResponse | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const inicial = rangoDesdeUrl(window.location.search);
    setPreset(inicial.preset);
    setRango(inicial.rango);
    setListo(true);
  }, []);

  const cargar = useCallback(async () => {
    if (!token || !listo || !Number.isInteger(userId) || userId <= 0) return;
    setCargando(true);
    setError(null);
    try {
      setData(await fetchKpisPersona(token, userId, rango));
    } catch (e) {
      setData(null);
      setError(formatApiError(e, "No se pudo cargar el detalle"));
    } finally {
      setCargando(false);
    }
  }, [token, userId, rango, listo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!listo || !rango.desde || !rango.hasta || !Number.isInteger(userId)) return;
    const q = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });
    window.history.replaceState(null, "", `${KPIS_PATH}/${userId}?${q.toString()}`);
  }, [rango, listo, userId]);

  const qs = rango.desde && rango.hasta ? `?desde=${rango.desde}&hasta=${rango.hasta}` : "";

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`${KPIS_PATH}${qs}`} style={{ color: "inherit", textDecoration: "none" }}>
            ← KPIs del equipo
          </Link>
        }
        title={data?.persona.nombre ?? "Detalle"}
        subtitle={data ? [data.persona.puesto, data.horario.etiqueta].filter(Boolean).join(" · ") : undefined}
        meta={data ? <SemaforoKpiChip semaforo={data.semaforo} motivos={data.motivos} /> : undefined}
        actions={
          <RangoSelector
            preset={preset}
            rango={rango}
            onChange={(p, r) => {
              setPreset(p);
              setRango(r);
            }}
          />
        }
      />

      {error ? <InlineAlert message={error} /> : null}

      {cargando && !data ? (
        <EmptyState icon={<HourglassTopIcon fontSize="inherit" aria-hidden="true" />} title="Calculando…" description="Juntando checadas, comidas y actividades." />
      ) : null}

      {data ? (
        <div style={{ display: "grid", gap: 16, opacity: cargando ? 0.6 : 1, transition: "opacity 120ms" }}>
          {data.motivos.length ? (
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              <strong style={{ color: SEMAFORO_KPI_COLORS[data.semaforo] }}>Qué mirar:</strong> {data.motivos.join(" · ")}
            </div>
          ) : null}

          <KpiResumen totales={data.totales} />

          <Section flush title="Día por día" subtitle="Lo más reciente arriba. Pasa el cursor por la barra para ver las horas." actions={<LeyendaTramos />}>
            {data.dias.length === 0 ? (
              <EmptyState
                icon={<EventBusyOutlinedIcon fontSize="inherit" aria-hidden="true" />}
                title="Sin jornadas en este rango"
                description="No hay checadas ni actividades registradas en esas fechas."
              />
            ) : (
              <div>
                {data.dias.map((d) => (
                  <FilaDia key={d.fecha} d={d} />
                ))}
              </div>
            )}
          </Section>

          {data.justificaciones.length ? (
            <Section dense title="Faltas justificadas">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, display: "grid", gap: 4 }}>
                {data.justificaciones.map((j) => (
                  <li key={j.fecha}>
                    <strong>{fechaCorta(j.fecha)}</strong> · {j.motivo}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <details style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 650 }}>¿Cómo se calcula?</summary>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
              {data.supuestos.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}
    </>
  );
}
