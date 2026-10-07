"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import { Alert, Avatar, Badge, Button, Card, CardHead, EmptyState, InfoPopover, PageHead, SkeletonRows, tabla } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { PRESETS_NOMINA, RangoSelector } from "@/components/pizarra/PizarraKpi";
import DiasEnLinea from "@/components/kpis/DiasEnLinea";
import { LeyendaJornada } from "@/components/kpis/RankingPersonas";
import HorasExtraPorAprobar from "@/components/kpis/HorasExtraPorAprobar";
import { formatApiError } from "@/lib/erp-api";
import { rangoDePreset, type BoardRange, type RangoPreset } from "@/lib/team-board-api";
import { KPIS_PATH, fechaCorta, fetchKpisPersona, formatPctKpi, horaMx, rangoDesdeUrl, type KpisPersonaResponse } from "@/lib/kpis-equipo";
import {
  PESOS_CUMPLIMIENTO,
  actividadesDelRango,
  estadoDeEntrega,
  fechaHoraMx,
  horasEnPalabras,
  porQueCuenta,
  resumenEnPalabras,
  revisionDeEntrega,
  tonoCumplimiento,
  tonoProductividad,
} from "@/lib/kpis-lectura";
import s from "@/components/kpis/kpis.module.css";
import st from "./indicadores.module.css";


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
      // Si ya se veía un rango, se queda a la vista; solo se avisa.
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
  // Una API que aún no manda el cumplimiento (undefined) deja la cifra de productividad, como antes.
  const hayCumplimiento = t != null && t.cumplimientoPct !== undefined;
  const pctGrande = hayCumplimiento ? (t?.cumplimientoPct ?? null) : (t?.productividadPct ?? null);
  const partes = t?.cumplimientoPartes ?? [];
  const entregas = data?.entregas;

  return (
    <div className={st.pagina}>
      <PageHead
        back={{ href: `${KPIS_PATH}${qs}`, label: "KPIs del equipo" }}
        title={data?.persona.nombre ?? "Detalle"}
        description={data ? [data.persona.puesto, data.horario.etiqueta].filter(Boolean).join(" · ") : undefined}
        actions={
          <>
            <RangoSelector
              presets={PRESETS_NOMINA}
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
        <Alert
          tone="danger"
          role="alert"
          action={
            <Button size="sm" onClick={() => void cargar()} loading={cargando}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      {cargando && !data ? (
        <Card>
          <SkeletonRows rows={4} label="Calculando" />
        </Card>
      ) : null}

      {data && t ? (
        <div className={st.cuerpo} data-cargando={cargando ? "true" : undefined} aria-busy={cargando || undefined}>
          <Card pad>
            <div className={st.resumen}>
              <div className={st.cifra}>
                <Avatar url={data.persona.avatarUrl} name={data.persona.nombre} size={48} />
                <div
                  title={
                    hayCumplimiento ? (pctGrande == null ? "Sin entregas que medir en estas fechas" : PESOS_CUMPLIMIENTO) : undefined
                  }
                >
                  <div
                    className={st.pct}
                    data-tono={hayCumplimiento ? tonoCumplimiento(pctGrande) : tonoProductividad(pctGrande)}
                  >
                    {formatPctKpi(pctGrande)}
                  </div>
                  <div className={st.pctEtiqueta}>{hayCumplimiento ? "cumplimiento" : "productividad"}</div>
                </div>
              </div>
              <div className={st.lectura}>
                <p className={st.lecturaTexto}>
                  {resumenEnPalabras(t, { conHorario: data.horario.entrada != null })}
                </p>
                <div className={st.datos}>
                  <span>{t.diasConJornada} días con jornada</span>
                  {hayCumplimiento ? (
                    <span title="Minutos con el reloj de una actividad corriendo ÷ minutos en jornada">
                      Tiempo en actividades {formatPctKpi(t.productividadPct)}
                    </span>
                  ) : null}
                  <span title="Horas en jornada sin ninguna actividad abierta">Sin actividad {horasEnPalabras(t.minutosInactivos)}</span>
                  {t.minutosExtra ? <span title="Arriba de 8 h netas entre semana, o todo lo del fin de semana">Extra {horasEnPalabras(t.minutosExtra)}</span> : null}
                </div>
              </div>
            </div>
            {/* De qué está hecho el cumplimiento: cada parte con su dato y lo que pesa. */}
            {partes.length ? (
              <ul className={st.partes} aria-label="Partes del cumplimiento">
                {partes.map((p) => (
                  <li key={p.clave} className={st.parte}>
                    <span className={st.parteCabeza}>
                      <span className={st.parteEtiqueta}>{p.etiqueta}</span>
                      <span className={st.partePct} data-tono={tonoCumplimiento(p.pct)}>
                        {formatPctKpi(p.pct)}
                      </span>
                    </span>
                    <span className={s.barra} aria-hidden="true">
                      <span className={s.barraProductiva} style={{ width: `${Math.max(0, Math.min(100, p.pct))}%` }} />
                    </span>
                    <span className={st.parteDetalle}>
                      {p.detalle}
                      {p.peso > 0 ? ` · pesa ${p.peso} %` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          {entregas ? (
            <Card>
              <CardHead
                title="Entregas"
                actions={
                  <InfoPopover label="Cómo se miden las entregas" title="Cómo se miden">
                    <p className={st.popParrafo}>
                      <strong className={st.fuerte}>A tiempo</strong> es que la entregó antes de su límite; cuenta la
                      hora en que la persona la entregó, no la hora en que el jefe la aprobó. Sin límite, cuenta a
                      tiempo. <strong className={st.fuerte}>Sin entregar</strong> es que su límite ya pasó y no la ha
                      entregado. <strong className={st.fuerte}>Aprobada a la primera</strong> es que el jefe no se la
                      devolvió. <strong className={st.fuerte}>Tiempo</strong> es lo que de verdad trabajó en ella (su
                      reloj) contra su tiempo máximo, o su estimado + 25 % si no tiene máximo.
                    </p>
                  </InfoPopover>
                }
              />
              {entregas.length ? (
                <div className={tabla.tabla} role="table" aria-label="Entregas del rango">
                  <div className={`${tabla.cabeza} ${st.entFila} ${st.entCabeza}`} role="row">
                    <span role="columnheader">Actividad</span>
                    <span role="columnheader">Límite</span>
                    <span role="columnheader" title="Cuándo la entregó la persona, no cuándo la aprobó el jefe">
                      Entregada
                    </span>
                    <span role="columnheader">Estado</span>
                    <span role="columnheader">Revisión</span>
                    <span role="columnheader" title="Lo que trabajó en ella contra su tiempo máximo">
                      Tiempo
                    </span>
                  </div>
                  {entregas.map((e, i) => {
                    const estado = estadoDeEntrega(e);
                    const revision = revisionDeEntrega(e);
                    return (
                      <div key={`${e.activityId}-${i}`} className={`${tabla.fila} ${st.entFila}`} role="row">
                        <span role="cell" className={tabla.celda}>
                          <span>
                            {e.anNumber ? (
                              <Link href={`/erp/actividades/${e.activityId}`} className={s.folio}>
                                {e.anNumber}
                              </Link>
                            ) : null}{" "}
                            {e.titulo ?? "Actividad"}
                          </span>
                        </span>
                        <span
                          role="cell"
                          className={`${tabla.tenue} ${st.num}`}
                          data-sin-limite={e.limite ? undefined : "true"}
                        >
                          {e.limite ? fechaHoraMx(e.limite) : "Sin límite"}
                        </span>
                        <span role="cell" className={`${tabla.tenue} ${st.num}`}>
                          {fechaHoraMx(e.entregadaAt)}
                        </span>
                        <span role="cell">
                          <Badge tone={estado.tono}>{estado.texto}</Badge>
                        </span>
                        <span role="cell" className={revision.tono === "neutral" ? tabla.tenue : undefined}>
                          {revision.tono === "warning" ? <Badge tone="warning">{revision.texto}</Badge> : revision.texto}
                        </span>
                        <span
                          role="cell"
                          className={e.tiempo === "adecuado" || e.tiempo == null ? `${tabla.tenue} ${st.num}` : st.num}
                          title={e.minutosPlan ? `Estimado: ${horasEnPalabras(e.minutosPlan)}` : undefined}
                        >
                          {e.minutosReales == null && e.minutosMaximo == null
                            ? "—"
                            : e.tiempo === "excedido"
                              ? <Badge tone="warning">{`${horasEnPalabras(e.minutosReales)} de ${horasEnPalabras(e.minutosMaximo)}`}</Badge>
                              : e.minutosMaximo != null
                                ? `${horasEnPalabras(e.minutosReales)} de ${horasEnPalabras(e.minutosMaximo)}`
                                : `${horasEnPalabras(e.minutosReales)} · sin estimado`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="Sin entregas en estas fechas" />
              )}
            </Card>
          ) : null}

          {/* Calculado no es autorizado: aquí el jefe decide qué se paga de más. */}
          <HorasExtraPorAprobar
            token={token}
            userId={userId}
            rango={{ desde: data.desde, hasta: data.hasta }}
            dias={data.dias.map((d) => ({ fecha: d.fecha, minutosExtra: d.minutosExtra ?? 0 }))}
            onDecidido={() => void cargar()}
          />

          <Card>
            <CardHead title="Día por día" actions={<LeyendaJornada conComida />} />
            {data.dias.length ? (
              <DiasEnLinea dias={data.dias} />
            ) : (
              <EmptyState icon={<EventBusyOutlinedIcon fontSize="inherit" aria-hidden="true" />} title="Sin jornadas en estas fechas" />
            )}
          </Card>

          <Card>
            <CardHead
              title="Actividades"
              actions={
                <InfoPopover label="Cómo se cuentan las actividades" title="Cómo se cuentan">
                  <p className={st.popParrafo}>
                    <strong className={st.fuerte}>Duración</strong> es el tiempo real: de «Iniciar» (o la foto
                    de entrada) al fin. <strong className={st.fuerte}>Cuenta</strong> es la parte que cayó
                    dentro de sus horas laboradas; lo que pasa en la comida o fuera de la jornada no suma. Una actividad
                    empezada sin checar entrada no cuenta.
                  </p>
                </InfoPopover>
              }
            />
            {actividades.length || diasFuera.length ? (
              <div className={tabla.tabla} role="table" aria-label="Actividades del rango">
                <div className={`${tabla.cabeza} ${s.actFila} ${s.actCabeza}`} role="row">
                  <span role="columnheader">Día</span>
                  <span role="columnheader">Actividad</span>
                  <span role="columnheader">Horario</span>
                  <span role="columnheader" className={tabla.num} title="Del inicio real al fin real">
                    Duración
                  </span>
                  <span role="columnheader" className={tabla.num} title="Lo que cayó dentro de sus horas laboradas">
                    Cuenta
                  </span>
                  <span role="columnheader" />
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
                      <span role="cell" className={`${tabla.tenue} ${st.num}`}>
                        {horaMx(a.inicio)}–{a.enCurso ? "ahora" : horaMx(a.fin)}
                      </span>
                      <span role="cell" className={tabla.num}>{horasEnPalabras(a.minutosReales)}</span>
                      <span role="cell" className={`${tabla.num} ${tabla.fuerte}`}>{horasEnPalabras(a.minutosEnJornada)}</span>
                      <span role="cell">{completa ? null : <Badge tone="warning">{porQueCuenta(a)}</Badge>}</span>
                    </div>
                  );
                })}
                {diasFuera.map((d) => (
                  <div key={`fuera-${d.fecha}`} className={`${tabla.fila} ${s.actFila}`} role="row">
                    <span role="cell" className={tabla.tenue}>{fechaCorta(d.fecha)}</span>
                    <span role="cell" className={st.segundo}>
                      {d.actividadesFueraDeJornada === 1 ? "1 actividad" : `${d.actividadesFueraDeJornada} actividades`} sin checar entrada
                    </span>
                    <span role="cell" className={tabla.tenue}>—</span>
                    <span role="cell" className={tabla.num}>—</span>
                    <span role="cell" className={`${tabla.num} ${tabla.fuerte}`}>0 min</span>
                    <span role="cell">
                      <Badge tone="danger" title="Empezó sin checar entrada, así que no suma productividad">
                        No cuenta
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Sin actividades en estas fechas" />
            )}
          </Card>

          {data.justificaciones.length ? (
            <Card>
              <CardHead title="Faltas justificadas" />
              <ul className={st.faltas}>
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
