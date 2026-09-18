"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import { Alert, Avatar, Badge, Card, CardHead, EmptyState, InfoPopover, PageHead, SkeletonRows, tabla } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { RangoSelector } from "@/components/pizarra/PizarraKpi";
import DiasEnLinea from "@/components/kpis/DiasEnLinea";
import { LeyendaJornada } from "@/components/kpis/RankingPersonas";
import { formatApiError } from "@/lib/erp-api";
import { rangoDePreset, type BoardRange, type RangoPreset } from "@/lib/team-board-api";
import { KPIS_PATH, fechaCorta, fetchKpisPersona, formatPctKpi, horaMx, rangoDesdeUrl, type KpisPersonaResponse } from "@/lib/kpis-equipo";
import { actividadesDelRango, horasEnPalabras, porQueCuenta, resumenEnPalabras, tonoProductividad } from "@/lib/kpis-lectura";
import s from "@/components/kpis/kpis.module.css";

const COLOR_PCT = {
  ok: "var(--ui-brand-text)",
  atencion: "var(--ui-warning-text)",
  critico: "var(--ui-danger-text)",
  sin_datos: "var(--ui-fg-3)",
} as const;

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
  const actividades = useMemo(() => actividadesDelRango(data?.dias ?? []), [data]);
  const diasFuera = (data?.dias ?? []).filter((d) => d.actividadesFueraDeJornada > 0);
  const t = data?.totales;

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto" }}>
      <PageHead
        back={{ href: `${KPIS_PATH}${qs}`, label: "KPIs del equipo" }}
        title={data?.persona.nombre ?? "Detalle"}
        description={data ? [data.persona.puesto, data.horario.etiqueta].filter(Boolean).join(" · ") : undefined}
        actions={
          <>
            <RangoSelector
              preset={preset}
              rango={rango}
              onChange={(p, r) => {
                setPreset(p);
                setRango(r);
              }}
            />
            {data ? (
              <InfoPopover label="¿Cómo se calcula?" title="Cómo se calcula">
                <ul>
                  {data.supuestos.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </InfoPopover>
            ) : null}
          </>
        }
      />

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {cargando && !data ? (
        <Card>
          <SkeletonRows rows={4} label="Calculando" />
        </Card>
      ) : null}

      {data && t ? (
        <div style={{ display: "grid", gap: 24, opacity: cargando ? 0.6 : 1, transition: "opacity 120ms" }}>
          <Card pad>
            <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 180 }}>
                <Avatar url={data.persona.avatarUrl} name={data.persona.nombre} size={48} />
                <div>
                  <div
                    style={{
                      fontSize: 40,
                      fontWeight: 600,
                      letterSpacing: "-0.03em",
                      lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                      color: COLOR_PCT[tonoProductividad(t.productividadPct)],
                    }}
                  >
                    {formatPctKpi(t.productividadPct)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ui-fg-3)", marginTop: 4 }}>productividad</div>
                </div>
              </div>
              <div style={{ flex: "1 1 360px", minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--ui-fg)" }}>
                  {resumenEnPalabras(t, { conHorario: data.horario.entrada != null })}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 10, fontSize: 12, color: "var(--ui-fg-3)" }}>
                  <span>{t.diasConJornada} día(s) con jornada</span>
                  <span>Sin actividad: {horasEnPalabras(t.minutosInactivos)}</span>
                  {t.minutosExtra ? <span>Tiempo extra: {horasEnPalabras(t.minutosExtra)}</span> : null}
                  {data.motivos.length ? <span>Qué mirar: {data.motivos.join(" · ")}</span> : null}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHead
              title="Día por día"
              subtitle="Lo más reciente arriba. Pasa el cursor por un bloque para ver la actividad."
              actions={<LeyendaJornada conComida />}
            />
            {data.dias.length ? (
              <DiasEnLinea dias={data.dias} />
            ) : (
              <EmptyState
                icon={<EventBusyOutlinedIcon />}
                title="Sin jornadas en estas fechas"
                description="No hay checadas ni actividades registradas en el rango."
              />
            )}
          </Card>

          <Card>
            <CardHead
              title="Actividades del rango"
              subtitle="Duración real (de «Iniciar» o foto de entrada a la salida) y cuánto de eso cuenta como productivo."
            />
            {actividades.length || diasFuera.length ? (
              <div className={tabla.tabla} role="table" aria-label="Actividades del rango">
                <div className={`${tabla.cabeza} ${s.actFila} ${s.actCabeza}`} role="row">
                  <span role="columnheader">Día</span>
                  <span role="columnheader">Actividad</span>
                  <span role="columnheader">Horario</span>
                  <span role="columnheader" className={tabla.num}>Duración</span>
                  <span role="columnheader" className={tabla.num}>Cuenta</span>
                  <span role="columnheader">Por qué</span>
                </div>
                {actividades.map((a) => {
                  const completa = a.minutosEnJornada >= a.minutosReales - 1;
                  return (
                    <div key={`${a.fecha}-${a.activityId}`} className={`${tabla.fila} ${s.actFila}`} role="row">
                      <span role="cell" className={tabla.tenue}>{fechaCorta(a.fecha)}</span>
                      <span role="cell" className={tabla.celda}>
                        <span>
                          {a.anNumber ? (
                            <Link href={`/erp/actividades/${a.activityId}`} className={s.folio}>
                              {a.anNumber}
                            </Link>
                          ) : null}{" "}
                          {a.titulo ?? "Actividad"}
                        </span>
                      </span>
                      <span role="cell" className={tabla.tenue} style={{ fontVariantNumeric: "tabular-nums" }}>
                        {horaMx(a.inicio)}–{a.enCurso ? "ahora" : horaMx(a.fin)}
                      </span>
                      <span role="cell" className={tabla.num}>{horasEnPalabras(a.minutosReales)}</span>
                      <span role="cell" className={`${tabla.num} ${tabla.fuerte}`}>{horasEnPalabras(a.minutosEnJornada)}</span>
                      <span role="cell">
                        <Badge tone={completa ? "brand" : "warning"}>{porQueCuenta(a)}</Badge>
                      </span>
                    </div>
                  );
                })}
                {diasFuera.map((d) => (
                  <div key={`fuera-${d.fecha}`} className={`${tabla.fila} ${s.actFila}`} role="row">
                    <span role="cell" className={tabla.tenue}>{fechaCorta(d.fecha)}</span>
                    <span role="cell" style={{ color: "var(--ui-fg-2)" }}>
                      {d.actividadesFueraDeJornada === 1 ? "1 actividad" : `${d.actividadesFueraDeJornada} actividades`} sin checar entrada
                    </span>
                    <span role="cell" className={tabla.tenue}>—</span>
                    <span role="cell" className={tabla.num}>—</span>
                    <span role="cell" className={`${tabla.num} ${tabla.fuerte}`}>0 min</span>
                    <span role="cell">
                      <Badge tone="danger">No cuenta: empezó sin estar checado</Badge>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Sin actividades con inicio en su jornada"
                description="Una actividad cuenta desde que la inicia (o sube la foto de entrada) mientras está checado."
              />
            )}
          </Card>

          {data.justificaciones.length ? (
            <Card>
              <CardHead title="Faltas justificadas" />
              <ul style={{ margin: 0, padding: "12px 16px 12px 32px", fontSize: 13, display: "grid", gap: 4 }}>
                {data.justificaciones.map((j) => (
                  <li key={j.fecha}>
                    <strong>{fechaCorta(j.fecha)}</strong> · {j.motivo}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
