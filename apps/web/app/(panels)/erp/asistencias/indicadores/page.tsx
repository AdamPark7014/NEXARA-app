"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import { Alert, Card, CardHead, EmptyState, InfoPopover, PageHead, Segmented, SkeletonRows, Stat, StatRow } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { RangoSelector } from "@/components/pizarra/PizarraKpi";
import RankingPersonas, { LeyendaJornada } from "@/components/kpis/RankingPersonas";
import { formatApiError } from "@/lib/erp-api";
import { rangoDePreset, type BoardRange, type RangoPreset } from "@/lib/team-board-api";
import { KPIS_PATH, fetchKpisEquipo, formatPctKpi, rangoDesdeUrl, type KpiPersonaFila, type KpisEquipoResponse } from "@/lib/kpis-equipo";
import { horasEnPalabras, ordenaRanking, tonoProductividad, type OrdenRanking } from "@/lib/kpis-lectura";

const ORDENES: ReadonlyArray<{ id: OrdenRanking; label: string }> = [
  { id: "productividad", label: "Productividad" },
  { id: "retardos", label: "Retardos" },
  { id: "nombre", label: "Nombre" },
];

const TONO_STAT = { ok: "brand", atencion: "warning", critico: "danger", sin_datos: "default" } as const;

export default function KpisEquipoPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [preset, setPreset] = useState<RangoPreset>("semana");
  const [rango, setRango] = useState<BoardRange>(() => rangoDePreset("semana"));
  const [listo, setListo] = useState(false);
  const [data, setData] = useState<KpisEquipoResponse | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orden, setOrden] = useState<OrdenRanking>("productividad");

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

  const personas = useMemo(() => ordenaRanking(data?.personas ?? [], orden), [data, orden]);
  const qs = rango.desde && rango.hasta ? `?desde=${rango.desde}&hasta=${rango.hasta}` : "";
  const hrefDe = (p: KpiPersonaFila) => `${KPIS_PATH}/${p.persona.id}${qs}`;
  const soloYo = data != null && data.personas.length === 1 && data.personas[0].persona.id === user?.id;

  // Lo que cambia cómo leer los números: en corto, debajo de las cifras.
  const notas: string[] = [];
  if (data) {
    const t = data.equipo.totales;
    if (t.jornadasAbiertas) notas.push(`${t.jornadasAbiertas} en jornada ahora (cuentan hasta este momento)`);
    if (t.jornadasSinSalida) notas.push(`${t.jornadasSinSalida} sin salida (se cerraron como el cierre automático)`);
    if (t.cierresAutomaticos) notas.push(`${t.cierresAutomaticos} salida(s) automática(s) de las 23:30`);
    if (t.uniforme.sinRevisar) notas.push(`${t.uniforme.sinRevisar} entrada(s) sin revisar uniforme — márcalas en Asistencias`);
    if (t.actividadesFueraDeJornada) notas.push(`${t.actividadesFueraDeJornada} actividad(es) sin checar entrada: no cuentan`);
  }

  const t = data?.equipo.totales;

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto" }}>
      <PageHead
        back={{ href: "/erp/asistencias", label: "Asistencias" }}
        title="KPIs del equipo"
        description={
          soloYo
            ? "No tienes gente a tu cargo: aquí ves lo tuyo."
            : "Qué parte de la jornada de cada persona se fue en actividades, quién llegó tarde y cómo va el uniforme."
        }
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

      {t ? (
        <StatRow>
          <Stat
            label="Productividad del equipo"
            value={formatPctKpi(t.productividadPct)}
            hint="Horas en actividades ÷ horas en jornada"
            tone={TONO_STAT[tonoProductividad(t.productividadPct)]}
          />
          <Stat
            label="Horas productivas / en jornada"
            value={
              <>
                {Math.round(t.minutosProductivos / 60)} h
                <span style={{ color: "var(--ui-fg-3)", fontWeight: 500 }}> / {Math.round(t.minutosLaborados / 60)} h</span>
              </>
            }
            hint={`${horasEnPalabras(t.minutosInactivos)} en jornada sin actividad`}
          />
          <Stat
            label="Retardos"
            value={t.retardos}
            hint={t.retardos ? `${horasEnPalabras(t.minutosTarde)} tarde en total` : "Todos a tiempo"}
            tone={t.retardos >= 3 ? "warning" : "default"}
          />
          <Stat
            label="Uniforme"
            value={formatPctKpi(t.uniforme.pct)}
            hint={t.uniforme.revisadas ? `${t.uniforme.ok} de ${t.uniforme.revisadas} entradas revisadas` : "Sin entradas revisadas"}
            tone={t.uniforme.pct != null && t.uniforme.pct < 80 ? "warning" : "default"}
          />
        </StatRow>
      ) : null}

      {notas.length ? (
        <p style={{ margin: "-12px 0 16px", fontSize: 12, lineHeight: 1.5, color: "var(--ui-fg-3)" }}>
          <span style={{ fontWeight: 500, color: "var(--ui-fg-2)" }}>Para leer bien las cifras: </span>
          {notas.join(" · ")}.
        </p>
      ) : null}

      <Card>
        <CardHead
          title={soloYo ? "Tus horas" : "Por persona"}
          subtitle={
            data
              ? `${data.personas.length} persona(s) · ${data.scope === "company" ? "toda la empresa" : "tu organigrama"} · toca a alguien para ver su día a día`
              : undefined
          }
          actions={
            <>
              <LeyendaJornada />
              <Segmented items={ORDENES} value={orden} onChange={setOrden} ariaLabel="Ordenar por" />
            </>
          }
        />
        {cargando && !data ? (
          <SkeletonRows rows={5} label="Calculando indicadores" />
        ) : personas.length ? (
          <div style={{ opacity: cargando ? 0.6 : 1, transition: "opacity 120ms" }}>
            <RankingPersonas personas={personas} hrefDe={hrefDe} />
          </div>
        ) : data ? (
          <EmptyState
            icon={<GroupsOutlinedIcon />}
            title="Nadie en tu alcance"
            description="Aquí aparece la gente que te reporta en el organigrama."
          />
        ) : null}
      </Card>
    </div>
  );
}
