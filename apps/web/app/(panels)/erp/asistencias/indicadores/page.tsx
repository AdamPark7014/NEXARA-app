"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import { Alert, Button, Card, EmptyState, InfoPopover, PageHead, Segmented, SkeletonRows } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { PRESETS_NOMINA, RangoSelector } from "@/components/pizarra/PizarraKpi";
import DesempenoTablero from "@/components/kpis/DesempenoTablero";
import ActividadPorDia from "@/components/kpis/ActividadPorDia";
import { formatApiError } from "@/lib/erp-api";
import { rangoDePreset, type BoardRange, type RangoPreset } from "@/lib/team-board-api";
import { KPIS_PATH, fetchKpisEquipo, rangoDesdeUrl, type KpiPersonaFila, type KpisEquipoResponse } from "@/lib/kpis-equipo";
import { horasEnPalabras, ordenaRanking, type OrdenRanking } from "@/lib/kpis-lectura";
import { descargarPreNominaExcel } from "@/lib/asistencia-confiable-api";

// `productividad` conserva su id; en pantalla es lo que mide: tiempo con una actividad corriendo.
const ORDENES: ReadonlyArray<{ id: OrdenRanking; label: string }> = [
  { id: "cumplimiento", label: "Cumplimiento" },
  { id: "productividad", label: "Tiempo en actividades" },
  { id: "retardos", label: "Retardos" },
  { id: "nombre", label: "Nombre" },
];

/** «28 sep – 4 oct», o un solo día: lo que va a traer el Excel. */
function etiquetaPeriodo(r: BoardRange): string {
  if (!r.desde || !r.hasta) return "periodo";
  const corta = (dia: string) =>
    new Date(`${dia}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" }).replace(".", "");
  return r.desde === r.hasta ? corta(r.desde) : `${corta(r.desde)} – ${corta(r.hasta)}`;
}

export default function KpisEquipoPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [preset, setPreset] = useState<RangoPreset>("semana");
  const [rango, setRango] = useState<BoardRange>(() => rangoDePreset("semana"));
  const [listo, setListo] = useState(false);
  const [data, setData] = useState<KpisEquipoResponse | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orden, setOrden] = useState<OrdenRanking>("cumplimiento");
  const [bajando, setBajando] = useState(false);
  const [errorNomina, setErrorNomina] = useState<string | null>(null);

  /**
   * Pre-nómina del periodo en Excel.
   *
   * Es el paso entre «el jefe mira los indicadores» y «alguien captura los pagos»: las
   * mismas horas de esta pantalla, netas de comida, con el tiempo extra aprobado aparte
   * del calculado y una columna de qué revisar antes de pagar.
   */
  const bajarPreNomina = async () => {
    if (!token || !rango.desde || !rango.hasta) return;
    setBajando(true);
    setErrorNomina(null);
    try {
      await descargarPreNominaExcel(token, { desde: rango.desde, hasta: rango.hasta });
    } catch (e) {
      setErrorNomina(formatApiError(e, "No se pudo generar la pre-nómina"));
    } finally {
      setBajando(false);
    }
  };

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

  // Una API que aún no manda el cumplimiento (undefined) deja la pantalla como antes: por tiempo.
  const hayCumplimiento = data == null || data.equipo.totales.cumplimientoPct !== undefined;
  const ordenes = hayCumplimiento ? ORDENES : ORDENES.filter((o) => o.id !== "cumplimiento");
  const ordenVisto: OrdenRanking = !hayCumplimiento && orden === "cumplimiento" ? "productividad" : orden;
  const personas = useMemo(() => ordenaRanking(data?.personas ?? [], ordenVisto), [data, ordenVisto]);
  const qs = rango.desde && rango.hasta ? `?desde=${rango.desde}&hasta=${rango.hasta}` : "";
  const hrefDe = (p: KpiPersonaFila) => `${KPIS_PATH}/${p.persona.id}${qs}`;
  const soloYo = data != null && data.personas.length === 1 && data.personas[0].persona.id === user?.id;

  // Lo que cambia cómo leer los números. No va en la página: va en la ⓘ.
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
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <PageHead
        back={{ href: "/erp/asistencias", label: "Asistencias" }}
        title="Desempeño del equipo"
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
              <Button
                variant="secondary"
                iconStart={<FileDownloadOutlinedIcon fontSize="small" />}
                loading={bajando}
                disabled={bajando}
                onClick={() => void bajarPreNomina()}
                title="Resumen por persona, horas de cada día y detalle diario de las fechas elegidas"
              >
                {bajando ? "Generando…" : `Excel · ${etiquetaPeriodo(rango)}`}
              </Button>
            ) : null}
            {data ? (
              <InfoPopover label="¿Cómo se calcula?" title="Cómo se calcula">
                {notas.length ? (
                  <>
                    <p style={{ margin: "0 0 8px" }}>
                      <strong style={{ color: "var(--ui-fg)" }}>En estas fechas:</strong> {notas.join(" · ")}.
                    </p>
                  </>
                ) : null}
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

      {errorNomina ? (
        <Alert tone="danger" role="alert">
          {errorNomina}
        </Alert>
      ) : null}

      {t && t.diasExtraPendientes > 0 ? (
        <Alert tone="warning">
          {t.diasExtraPendientes} día(s) con tiempo extra sin aprobar ({horasEnPalabras(t.minutosExtraPendientes)}).
          Solo lo aprobado llega a la pre-nómina: entra a la persona para decidirlo.
        </Alert>
      ) : null}

      {cargando && !data ? (
        <Card>
          <SkeletonRows rows={5} label="Calculando indicadores" />
        </Card>
      ) : t && personas.length ? (
        <div style={{ opacity: cargando ? 0.6 : 1, transition: "opacity 120ms" }}>
          <DesempenoTablero
            equipo={t}
            personas={personas}
            hrefDe={hrefDe}
            titulo={soloYo ? "Tus números" : "Por persona"}
            herramientas={<Segmented items={ordenes} value={ordenVisto} onChange={setOrden} ariaLabel="Ordenar por" />}
          />
        </div>
      ) : data ? (
        <Card>
          <EmptyState icon={<GroupsOutlinedIcon />} title="Nadie en tu alcance" />
        </Card>
      ) : null}

      {data && !soloYo ? <ActividadPorDia personas={data.personas} hrefDe={hrefDe} /> : null}
    </div>
  );
}
