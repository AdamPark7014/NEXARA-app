"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import ListExportActions from "@/components/ui/ListExportActions";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import FilterToolbar from "@/components/FilterToolbar";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import {
  DetalleModal,
  Variacion,
  descargarCsv,
  hoyIso,
  inicioDeMesIso,
  pedirJson,
  queryString,
} from "@/components/erp/reportes-contabilidad";

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

  /**
   * Las tres cifras del comparativo en la tira de finanzas. La variación
   * conserva su color sobrio y su signo: no se convierte en semáforo.
   */
  const metricas: Metric[] = data
    ? [
        {
          label: "Presupuestado",
          value: <Money value={data.totales.planeado} />,
          hint: `${data.lineas.length} ${data.lineas.length === 1 ? "línea" : "líneas"} en el periodo`,
        },
        {
          label: "Real",
          value: <Money value={data.totales.real} />,
          hint: "lo que de verdad se gastó",
        },
        {
          label: "Variación",
          value: <Variacion valor={data.totales.variacion} porcentaje={data.totales.variacionPct} />,
          hint:
            data.totales.variacion >= 0
              ? "dentro de lo presupuestado"
              : "por encima de lo presupuestado",
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title="Presupuestos"
        subtitle="Presupuestado contra lo que de verdad se gastó, por centro de costo y periodo."
        density="ops"
        actions={
          <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <ListExportActions
              onExcel={() => void exportar()}
              excelBusy={exportando}
              excelDisabled={cargando || !data || data.lineas.length === 0}
            />
            <Button size="sm" variant="ghost" onClick={() => void cargar()} disabled={cargando}>
              Actualizar
            </Button>
          </div>
        }
      />

      {error && (
        <InlineAlert
          message={error}
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" variant="secondary" onClick={() => void cargar()}>
              Reintentar
            </Button>
          }
        />
      )}

      <div style={{ marginBottom: 12 }}>
        <FilterToolbar
          dates={[
            { label: "Desde", value: from, onChange: setFrom },
            { label: "Hasta", value: to, onChange: setTo },
          ]}
          selects={[
            {
              label: "Centro de costo",
              value: centroId,
              onChange: setCentroId,
              options: (data?.centros ?? []).map((c) => ({ value: String(c.id), label: c.etiqueta })),
              allLabel: "Todos los centros",
            },
          ]}
          onClear={() => {
            setFrom(inicioDeMesIso());
            setTo(hoyIso());
            setCentroId("");
          }}
          resultCount={data?.lineas.length ?? null}
        />
      </div>

      {cargando ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }} aria-busy="true">
          {token
            ? "Comparando presupuesto contra real…"
            : "Esperando la sesión para pedir el comparativo…"}
        </p>
      ) : !data ? (
        error ? null : <EmptyState title="Sin datos" description="Ajusta el periodo y vuelve a intentar." />
      ) : data.lineas.length === 0 ? (
        <EmptyState
          title="Sin presupuestos en este periodo"
          description="No hay presupuestos que caigan dentro del rango elegido. Créalos desde Contabilidad general o amplía el periodo."
        />
      ) : (
        <>
          {/* El periodo que el API dice haber comparado: cuando acota el rango
              pedido, la pantalla enseñaba las fechas del filtro y no las suyas. */}
          <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--text-secondary)" }}>
            Comparando del {data.periodo.from} al {data.periodo.to}.
          </p>

          <div style={{ marginBottom: 12 }}>
            <MetricStrip ariaLabel="Presupuesto contra real" metrics={metricas} />
          </div>

          {data.porCentro.length > 1 && (
            <Section title="Por centro de costo" dense flush>
              <DataTable
                columns={columnasCentro}
                rows={data.porCentro}
                rowKey={(r) => r.costCenterId}
                density="compact"
                stickyHeader={false}
                onRowClick={(r) => abrirDetalle({ ...r, year: new Date(data.periodo.to).getFullYear(), month: null })}
              />
            </Section>
          )}

          <div style={{ marginTop: data.porCentro.length > 1 ? 12 : 0 }}>
            <DataTable
              columns={columnasLinea}
              rows={data.lineas}
              rowKey={(r) => r.clave}
              density="compact"
              onRowClick={abrirDetalle}
            />
          </div>

          <div
            style={{
              marginTop: 8,
              display: "flex",
              // Sin envolver, en pantalla estrecha el pie se salía del panel.
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "6px 24px",
              padding: "10px 16px",
              borderRadius: "var(--nx-panel-radius)",
              border: "1px solid var(--nx-panel-hairline)",
              background: "var(--surface-2)",
              fontSize: 12.5,
            }}
          >
            <span style={{ marginRight: "auto", color: "var(--text-secondary)", fontWeight: 700 }}>
              Total
            </span>
            <span style={{ whiteSpace: "nowrap" }}>
              <span style={{ color: "var(--text-tertiary)", marginRight: 6 }}>Presupuestado</span>
              <Money value={data.totales.planeado} bold={false} />
            </span>
            <span style={{ whiteSpace: "nowrap" }}>
              <span style={{ color: "var(--text-tertiary)", marginRight: 6 }}>Real</span>
              <Money value={data.totales.real} bold={false} />
            </span>
            <span style={{ whiteSpace: "nowrap" }}>
              <span style={{ color: "var(--text-tertiary)", marginRight: 6 }}>Variación</span>
              <Variacion valor={data.totales.variacion} porcentaje={data.totales.variacionPct} />
            </span>
          </div>

          {data.nota && (
            <p style={{ marginTop: 10, fontSize: 12, color: "var(--text-tertiary)" }}>{data.nota}</p>
          )}
          <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-tertiary)" }}>
            Haz clic en una línea para ver las pólizas que formaron el «real».
          </p>
        </>
      )}

      <DetalleModal
        abierto={Boolean(detalle)}
        titulo={detalle?.titulo ?? ""}
        path={detalle?.path ?? null}
        token={token}
        onClose={() => setDetalle(null)}
      />
    </>
  );
}
