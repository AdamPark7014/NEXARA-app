"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import { useUser } from "@/components/UserContext";
import { RangoSelector } from "@/components/pizarra/PizarraKpi";
import KpiResumen, { SemaforoKpiChip } from "@/components/kpis/KpiResumen";
import { formatApiError } from "@/lib/erp-api";
import { resolveAssetUrl } from "@/lib/evidence-display";
import { rangoDePreset, type BoardRange, type RangoPreset } from "@/lib/team-board-api";
import {
  KPIS_PATH,
  ORDEN_KPI_LABELS,
  SEMAFORO_KPI_COLORS,
  fetchKpisEquipo,
  formatHoras,
  formatPctKpi,
  ordenaPersonas,
  rangoDesdeUrl,
  type KpiPersonaFila,
  type KpisEquipoResponse,
  type OrdenKpi,
} from "@/lib/kpis-equipo";

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function Avatar({ url, nombre }: { url: string | null; nombre: string }) {
  const src = url ? resolveAssetUrl(url) : null;
  const size = 32;
  if (src) {
    return (
      <img src={src} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-grid",
        placeItems: "center",
        fontSize: 11,
        fontWeight: 700,
        color: "var(--primary)",
        background: "color-mix(in srgb, var(--primary) 14%, var(--surface))",
        flex: "0 0 auto",
      }}
    >
      {iniciales(nombre)}
    </span>
  );
}

/** Barra chica de % productividad con el color del semáforo. */
function BarraPct({ pct }: { pct: number | null }) {
  const color =
    pct == null ? SEMAFORO_KPI_COLORS.sin_datos : pct >= 70 ? SEMAFORO_KPI_COLORS.verde : pct >= 50 ? SEMAFORO_KPI_COLORS.amarillo : SEMAFORO_KPI_COLORS.rojo;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
      <div
        aria-hidden
        style={{ width: 56, height: 6, borderRadius: 999, background: "color-mix(in srgb, var(--border) 60%, transparent)", overflow: "hidden" }}
      >
        <div style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%`, height: "100%", background: color }} />
      </div>
      <span style={{ minWidth: 38, textAlign: "right", fontWeight: 700, color }}>{formatPctKpi(pct)}</span>
    </div>
  );
}

const th: CSSProperties = {
  textAlign: "right",
  padding: "10px 12px",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  background: "var(--surface)",
};
const td: CSSProperties = {
  textAlign: "right",
  padding: "10px 12px",
  fontSize: 13,
  fontVariantNumeric: "tabular-nums",
  borderBottom: "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
  whiteSpace: "nowrap",
};

export default function KpisEquipoPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const router = useRouter();

  const [preset, setPreset] = useState<RangoPreset>("semana");
  const [rango, setRango] = useState<BoardRange>(() => rangoDePreset("semana"));
  const [listo, setListo] = useState(false);
  const [data, setData] = useState<KpisEquipoResponse | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orden, setOrden] = useState<OrdenKpi>("semaforo");

  useEffect(() => {
    const inicial = rangoDesdeUrl(window.location.search);
    setPreset(inicial.preset);
    setRango(inicial.rango);
    setListo(true);
  }, []);

  const cargar = useCallback(async () => {
    if (!token || !listo) return;
    setCargando(true);
    setError(null);
    try {
      setData(await fetchKpisEquipo(token, rango));
    } catch (e) {
      setData(null);
      setError(formatApiError(e, "No se pudieron cargar los indicadores"));
    } finally {
      setCargando(false);
    }
  }, [token, rango, listo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // El rango viaja en la URL: recargar o volver del detalle deja lo mismo.
  useEffect(() => {
    if (!listo || !rango.desde || !rango.hasta) return;
    const q = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });
    window.history.replaceState(null, "", `${KPIS_PATH}?${q.toString()}`);
  }, [rango, listo]);

  const personas = useMemo(() => ordenaPersonas(data?.personas ?? [], orden), [data, orden]);
  const qs = rango.desde && rango.hasta ? `?desde=${rango.desde}&hasta=${rango.hasta}` : "";
  const abrir = (p: KpiPersonaFila) => router.push(`${KPIS_PATH}/${p.persona.id}${qs}`);
  const soloYo = data != null && data.personas.length === 1 && data.personas[0].persona.id === user?.id;

  const avisos: string[] = [];
  if (data) {
    const t = data.equipo.totales;
    if (t.jornadasAbiertas) avisos.push(`${t.jornadasAbiertas} jornada(s) siguen abiertas: cuentan hasta ahora.`);
    if (t.jornadasSinSalida) avisos.push(`${t.jornadasSinSalida} jornada(s) sin salida se cerraron como el cierre automático.`);
    if (t.cierresAutomaticos) avisos.push(`${t.cierresAutomaticos} salida(s) las puso el cierre automático de las 23:30.`);
    if (t.uniforme.sinRevisar) avisos.push(`${t.uniforme.sinRevisar} entrada(s) sin revisar el uniforme: márcalas en Asistencias.`);
    if (t.actividadesFueraDeJornada) avisos.push(`${t.actividadesFueraDeJornada} actividad(es) se hicieron sin checar entrada.`);
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/erp/asistencias" style={{ color: "inherit", textDecoration: "none" }}>
            ← Asistencias
          </Link>
        }
        title="KPIs del equipo"
        subtitle="Retardos, uniforme y horas laboradas contra horas productivas"
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
          <Section
            dense
            title={soloYo ? "Tus indicadores" : "Equipo"}
            subtitle={
              soloYo
                ? "No tienes gente a tu cargo: solo ves lo tuyo."
                : `${data.personas.length} persona(s) · ${data.scope === "company" ? "toda la empresa" : "tu organigrama"}`
            }
            actions={<SemaforoKpiChip semaforo={data.equipo.semaforo} motivos={data.equipo.motivos} />}
          >
            <KpiResumen totales={data.equipo.totales} />
            {avisos.length ? (
              <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--text-secondary)", display: "grid", gap: 2 }}>
                {avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : null}
          </Section>

          <Section
            flush
            title="Por persona"
            subtitle="Toca una fila para ver su día a día."
            actions={
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                Ordenar
                <select
                  value={orden}
                  onChange={(e) => setOrden(e.target.value as OrdenKpi)}
                  style={{
                    minHeight: 32,
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "inherit",
                    fontFamily: "inherit",
                    fontSize: 12.5,
                  }}
                >
                  {(Object.keys(ORDEN_KPI_LABELS) as OrdenKpi[]).map((k) => (
                    <option key={k} value={k}>
                      {ORDEN_KPI_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
            }
          >
            {personas.length === 0 ? (
              <EmptyState
                icon={<GroupsOutlinedIcon fontSize="inherit" aria-hidden="true" />}
                title="Nadie en tu alcance"
                description="Aquí aparece la gente que te reporta en el organigrama."
              />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: "left" }}>Persona</th>
                      <th style={{ ...th, textAlign: "left" }}>Semáforo</th>
                      <th style={th}>Retardos</th>
                      <th style={th}>Min tarde</th>
                      <th style={th}>Uniforme</th>
                      <th style={th}>H. laboradas</th>
                      <th style={th}>H. productivas</th>
                      <th style={th}>Inactividad</th>
                      <th style={th}>% productividad</th>
                      <th style={th}>Extra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personas.map((p) => {
                      const t = p.totales;
                      return (
                        <tr
                          key={p.persona.id}
                          tabIndex={0}
                          onClick={() => abrir(p)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              abrir(p);
                            }
                          }}
                          style={{ cursor: "pointer" }}
                          aria-label={`Ver el detalle de ${p.persona.nombre}`}
                        >
                          <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 180, maxWidth: 260 }}>
                              <Avatar url={p.persona.avatarUrl} nombre={p.persona.nombre} />
                              <div style={{ minWidth: 0 }}>
                                <Link
                                  href={`${KPIS_PATH}/${p.persona.id}${qs}`}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ fontWeight: 700, color: "inherit", textDecoration: "none" }}
                                >
                                  {p.persona.nombre}
                                </Link>
                                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                                  {[p.persona.puesto, p.horario.etiqueta].filter(Boolean).join(" · ")}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}>
                            {/* `min-width` en una celda no lo respeta la tabla: va en el contenido. */}
                            <div style={{ display: "grid", gap: 2, minWidth: 170, maxWidth: 230 }}>
                              <SemaforoKpiChip semaforo={p.semaforo} motivos={p.motivos} />
                              {p.motivos.length ? (
                                <span style={{ fontSize: 11, lineHeight: 1.35, color: "var(--text-tertiary)" }}>
                                  {p.motivos.join(" · ")}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td style={{ ...td, fontWeight: t.retardos ? 700 : 400, color: t.retardos ? SEMAFORO_KPI_COLORS.amarillo : undefined }}>
                            {t.retardos}
                          </td>
                          <td style={td}>{t.minutosTarde ? `${t.minutosTarde} min` : "—"}</td>
                          <td style={td} title={`${t.uniforme.ok} ✓ · ${t.uniforme.noOk} ✗ · ${t.uniforme.sinRevisar} sin revisar`}>
                            {formatPctKpi(t.uniforme.pct)}
                            {t.uniforme.sinRevisar ? (
                              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}> ({t.uniforme.sinRevisar} s/r)</span>
                            ) : null}
                          </td>
                          <td style={td}>{formatHoras(t.minutosLaborados)}</td>
                          <td style={td}>{formatHoras(t.minutosProductivos)}</td>
                          <td style={td}>{formatHoras(t.minutosInactivos)}</td>
                          <td style={td}>
                            <BarraPct pct={t.productividadPct} />
                          </td>
                          <td style={td}>{t.minutosExtra == null ? "—" : t.minutosExtra ? formatHoras(t.minutosExtra) : "0"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

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
