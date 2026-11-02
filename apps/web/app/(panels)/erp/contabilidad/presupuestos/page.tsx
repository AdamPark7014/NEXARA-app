"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import CompareArrowsOutlinedIcon from "@mui/icons-material/CompareArrowsOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import {
  Alert,
  Button,
  Card,
  CardHead,
  DataTable,
  DateInput,
  LinkButton,
  ListCard,
  ModuleToolbar,
  Select,
  SkeletonRows,
  Stat,
  StatRow,
  type Column,
} from "@/components/base";
import { MesaPagina } from "@/components/mesa-contable/MesaPagina";
import { Money } from "@/components/ui/DataTable";
import ListExportActions from "@/components/ui/ListExportActions";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import {
  DetalleModal,
  Variacion,
  descargarCsv,
  fechaLegible,
  hoyIso,
  inicioDeMesIso,
  pedirJson,
  queryString,
} from "@/components/erp/reportes-contabilidad";
import { DESTINOS, VacioConPrimerPaso } from "../_arranque";
import s from "./presupuestos.module.css";

type LineaComparativo = {
  clave: string;
  costCenterId: number;
  centro: string;
  presupuesto: string;
  year: number;
  month: number | null;
  periodo: string;
  planeado: number;
  real: number;
  variacion: number;
  /** null cuando no hay presupuesto contra el que medir — se oculta el %. */
  variacionPct: number | null;
};

type FilaCentro = {
  costCenterId: number;
  centro: string;
  planeado: number;
  real: number;
  variacion: number;
  variacionPct: number | null;
};

type Comparativo = {
  periodo: { from: string; to: string };
  centros: Array<{ id: number; etiqueta: string }>;
  lineas: LineaComparativo[];
  porCentro: FilaCentro[];
  totales: { planeado: number; real: number; variacion: number; variacionPct: number | null };
  nota: string | null;
};

/**
 * Presupuesto contra real.
 *
 * Variación positiva = quedó presupuesto sin gastar. Negativa = se pasó. Se
 * marca con el signo y un rojo sobrio, no con semáforos.
 */
export default function PresupuestosPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [from, setFrom] = useState(inicioDeMesIso);
  const [to, setTo] = useState(hoyIso);
  const [centroId, setCentroId] = useState("");

  const [data, setData] = useState<Comparativo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [detalle, setDetalle] = useState<{ titulo: string; path: string } | null>(null);

  const filtros = useMemo(() => ({ from, to, costCenterId: centroId }), [from, to, centroId]);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      const res = await pedirJson<Comparativo>(
        `accounting/workspace/presupuestos/comparativo${queryString(filtros)}`,
        token,
      );
      setData(res);
    } catch (e) {
      setError(formatApiError(e));
      setData(null);
    } finally {
      setCargando(false);
    }
  }, [token, filtros]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const exportar = async () => {
    if (!token) return;
    setExportando(true);
    setError(null);
    try {
      await descargarCsv(
        `accounting/workspace/presupuestos/comparativo/export${queryString(filtros)}`,
        token,
        "presupuesto-vs-real.csv",
      );
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setExportando(false);
    }
  };

  const abrirDetalle = (fila: { costCenterId: number; centro: string; year?: number; month?: number | null; periodo?: string }) => {
    setDetalle({
      titulo: `${fila.centro}${fila.periodo ? ` · ${fila.periodo}` : ""}`,
      path: `accounting/workspace/presupuestos/comparativo/detalle${queryString({
        costCenterId: fila.costCenterId,
        year: fila.year ?? new Date(to).getFullYear(),
        month: fila.month ?? null,
      })}`,
    });
  };

  const columnasLinea: Column<LineaComparativo>[] = useMemo(
    () => [
      { key: "centro", label: "Centro de costo" },
      { key: "presupuesto", label: "Presupuesto" },
      { key: "periodo", label: "Periodo" },
      {
        key: "planeado",
        label: "Presupuestado",
        align: "right",
        numeric: true,
        render: (r) => <Money value={r.planeado} bold={false} />,
      },
      {
        key: "real",
        label: "Real",
        align: "right",
        numeric: true,
        render: (r) => <Money value={r.real} bold={false} />,
      },
      {
        key: "variacion",
        label: "Variación",
        align: "right",
        numeric: true,
        render: (r) => <Variacion valor={r.variacion} porcentaje={r.variacionPct} />,
      },
    ],
    [],
  );

  const columnasCentro: Column<FilaCentro>[] = useMemo(
    () => [
      { key: "centro", label: "Centro de costo" },
      {
        key: "planeado",
        label: "Presupuestado",
        align: "right",
        numeric: true,
        render: (r) => <Money value={r.planeado} bold={false} />,
      },
      { key: "real", label: "Real", align: "right", numeric: true, render: (r) => <Money value={r.real} bold={false} /> },
      {
        key: "variacion",
        label: "Variación",
        align: "right",
        numeric: true,
        render: (r) => <Variacion valor={r.variacion} porcentaje={r.variacionPct} />,
      },
    ],
    [],
  );

  /** Sin filtro de centro, o con el valor «all» que algunas listas mandan, no hay centro elegido. */
  const hayFiltros = from !== "" || to !== "" || (centroId !== "" && centroId !== "all");
  const limpiarFiltros = () => {
    setFrom(inicioDeMesIso());
    setTo(hoyIso());
    setCentroId("");
  };
  const resultados = data?.lineas.length ?? null;

  /** Mientras llega el comparativo: la frase de siempre y renglones de mentira. */
  const textoCarga = token
    ? "Comparando presupuesto contra real…"
    : "Esperando la sesión para pedir el comparativo…";

  /**
   * El periodo que el API dice haber comparado: cuando acota el rango pedido, la
   * pantalla enseñaba las fechas del filtro y no las suyas. Solo hay periodo que
   * decir cuando hay líneas que mostrar.
   */
  const hayComparativo = Boolean(data) && (data?.centros.length ?? 0) > 0 && (data?.lineas.length ?? 0) > 0;

  return (
    <MesaPagina
      titulo="Presupuestos"
      descripcion="Presupuestado contra lo que de verdad se gastó, por centro de costo y periodo."
      meta={
        hayComparativo && data ? (
          <span>
            Comparando del {fechaLegible(data.periodo.from)} al {fechaLegible(data.periodo.to)}.
          </span>
        ) : undefined
      }
      terciarias={
        <>
          <ListExportActions
            size="md"
            onExcel={() => void exportar()}
            excelBusy={exportando}
            excelDisabled={cargando || !data || data.lineas.length === 0}
          />
          <Button variant="ghost" onClick={() => void cargar()} disabled={cargando}>
            Actualizar
          </Button>
        </>
      }
    >
      <Card as="div">
        <ModuleToolbar
          end={
            resultados != null ? (
              <span className={s.conteo} role="status">
                {resultados} resultado{resultados === 1 ? "" : "s"}
              </span>
            ) : undefined
          }
        >
          <label className={s.campoFecha}>
            <span>Desde</span>
            <DateInput
              aria-label="Desde"
              className={s.fecha}
              controlSize="sm"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className={s.campoFecha}>
            <span>Hasta</span>
            <DateInput
              aria-label="Hasta"
              className={s.fecha}
              controlSize="sm"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <Select
            aria-label="Centro de costo"
            title="Centro de costo"
            wrapperClassName={s.filtroCentro}
            controlSize="sm"
            value={centroId}
            onChange={(e) => setCentroId(e.target.value)}
          >
            <option value="">Todos los centros</option>
            {(data?.centros ?? []).map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.etiqueta}
              </option>
            ))}
          </Select>
          {hayFiltros ? <LinkButton onClick={limpiarFiltros}>Limpiar</LinkButton> : null}
        </ModuleToolbar>
      </Card>

      {error && (
        <Alert
          tone="danger"
          role="alert"
          className={s.alerta}
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" onClick={() => void cargar()}>
              Reintentar
            </Button>
          }
        >
          {`No se pudo comparar el presupuesto contra lo gastado. ${error} Reintenta o acota el periodo; si sigue igual, avisa a soporte.`}
        </Alert>
      )}

      {cargando ? (
        <ListCard listLabel="Presupuesto contra real">
          <div aria-busy="true">
            <p className={s.estado}>{textoCarga}</p>
            <SkeletonRows rows={4} label="Cargando el comparativo" />
          </div>
        </ListCard>
      ) : !data ? (
        error ? null : (
          <ListCard
            listLabel="Presupuesto contra real"
            empty
            emptyState={{
              icon: <BarChartOutlinedIcon />,
              title: "Todavía no hay comparativo",
              description:
                "No se ha calculado nada para este periodo. Fija las fechas arriba y pulsa Actualizar.",
            }}
          />
        )
      ) : data.centros.length === 0 ? (
        /* Sin configurar: no es que falte el presupuesto, falta contra qué
           medirlo. `centros` son TODOS los centros de costo de la empresa, no
           los del rango, así que vacío aquí significa vacío de verdad. */
        <ListCard
          listLabel="Presupuesto contra real"
          empty
          emptyState={
            <VacioConPrimerPaso
              title="Todavía no hay centros de costo"
              description="Un presupuesto se mide contra un centro de costo y no hay ninguno dado de alta. Créalo en Contabilidad general, pestaña Presupuestos, y luego captura el presupuesto del año."
              destino={DESTINOS.presupuesto}
            />
          }
        />
      ) : data.lineas.length === 0 ? (
        centroId ? (
          <ListCard
            listLabel="Presupuesto contra real"
            empty
            emptyState={{
              icon: <FilterAltOffOutlinedIcon />,
              title: "Ningún presupuesto en este filtro",
              description:
                "El centro de costo elegido no tiene presupuesto dentro del rango. Quítale el filtro o amplía el periodo.",
              action: (
                <Button size="sm" onClick={() => setCentroId("")}>
                  Ver todos los centros
                </Button>
              ),
            }}
          />
        ) : (
          <ListCard
            listLabel="Presupuesto contra real"
            empty
            emptyState={
              <VacioConPrimerPaso
                title="Sin presupuestos en este periodo"
                description={`Los centros de costo ya existen, pero ninguno tiene presupuesto entre el ${fechaLegible(data.periodo.from)} y el ${fechaLegible(data.periodo.to)}. Captura el del año y aquí verás, mes a mes, cuánto llevas gastado contra lo planeado.`}
                destino={DESTINOS.presupuesto}
              />
            }
          />
        )
      ) : (
        <>
          {/* Las tres cifras del comparativo. La variación conserva su color
              sobrio y su signo: no se convierte en semáforo. */}
          <StatRow variant="strip" ariaLabel="Presupuesto contra real">
            <Stat
              label="Presupuestado"
              value={<Money value={data.totales.planeado} />}
              hint={`${data.lineas.length} ${data.lineas.length === 1 ? "línea" : "líneas"} en el periodo`}
              icon={<RequestQuoteOutlinedIcon />}
              iconTone="neutral"
            />
            <Stat
              label="Real"
              value={<Money value={data.totales.real} />}
              hint="lo que de verdad se gastó"
              icon={<PaymentsOutlinedIcon />}
              iconTone="neutral"
            />
            <Stat
              label="Variación"
              value={<Variacion valor={data.totales.variacion} porcentaje={data.totales.variacionPct} />}
              hint={
                data.totales.variacion >= 0
                  ? "dentro de lo presupuestado"
                  : "por encima de lo presupuestado"
              }
              icon={<CompareArrowsOutlinedIcon />}
              iconTone="neutral"
            />
          </StatRow>

          {data.porCentro.length > 1 && (
            <ListCard
              listLabel="Por centro de costo"
              toolbar={<CardHead title="Por centro de costo" />}
            >
              <DataTable
                flush
                columns={columnasCentro}
                rows={data.porCentro}
                rowKey={(r) => r.costCenterId}
                density="compact"
                stickyHeader={false}
                ariaLabel="Presupuesto por centro de costo"
                onRowClick={(r) => abrirDetalle({ ...r, year: new Date(data.periodo.to).getFullYear(), month: null })}
              />
            </ListCard>
          )}

          <ListCard
            footer={
              <>
                <div className={s.totales}>
                  <span className={s.totalRotulo}>Total</span>
                  <span className={s.totalDato}>
                    <span className={s.totalEtiqueta}>Presupuestado</span>
                    <Money value={data.totales.planeado} bold={false} />
                  </span>
                  <span className={s.totalDato}>
                    <span className={s.totalEtiqueta}>Real</span>
                    <Money value={data.totales.real} bold={false} />
                  </span>
                  <span className={s.totalDato}>
                    <span className={s.totalEtiqueta}>Variación</span>
                    <Variacion valor={data.totales.variacion} porcentaje={data.totales.variacionPct} />
                  </span>
                </div>
                <div className={s.notas}>
                  {data.nota && <p>{data.nota}</p>}
                  <p>Haz clic en una línea para ver las pólizas que formaron el «real».</p>
                </div>
              </>
            }
          >
            <DataTable
              flush
              columns={columnasLinea}
              rows={data.lineas}
              rowKey={(r) => r.clave}
              density="compact"
              ariaLabel="Líneas de presupuesto"
              onRowClick={abrirDetalle}
            />
          </ListCard>
        </>
      )}

      <DetalleModal
        abierto={Boolean(detalle)}
        titulo={detalle?.titulo ?? ""}
        path={detalle?.path ?? null}
        token={token}
        onClose={() => setDetalle(null)}
      />
    </MesaPagina>
  );
}
