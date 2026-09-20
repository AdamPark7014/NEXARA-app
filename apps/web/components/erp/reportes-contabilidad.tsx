"use client";

import { useEffect, useState, type ReactNode } from "react";
import Modal from "@/components/ui/Modal";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import MetricStrip from "@/components/ui/MetricStrip";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";

/**
 * Piezas compartidas por `/erp/contabilidad/reportes` y
 * `/erp/contabilidad/presupuestos`.
 *
 * El API manda las columnas junto con las filas, así que aquí no hay ninguna
 * lista de reportes ni de columnas escrita a mano: se pinta lo que llega.
 */

export type TipoColumna = "texto" | "moneda" | "numero" | "porcentaje" | "fecha";

export type ColumnaReporte = {
  clave: string;
  etiqueta: string;
  tipo: TipoColumna;
  alineacion?: "left" | "right";
};

export type FilaReporte = Record<string, string | number | null> & { clave: string };

export type FiltroReporte = {
  clave: string;
  etiqueta: string;
  tipo: "fecha" | "seleccion";
  requerido: boolean;
  opciones?: Array<{ valor: string; etiqueta: string }>;
};

export type ReporteCatalogo = {
  id: string;
  nombre: string;
  descripcion: string;
  exportable: boolean;
  comparable: boolean;
  drilldown: boolean;
  filtros: FiltroReporte[];
};

export type ResultadoReporte = {
  id: string;
  nombre: string;
  descripcion: string;
  periodo: { from: string | null; to: string | null; asOf: string | null };
  columnas: ColumnaReporte[];
  filas: FilaReporte[];
  totales: Record<string, number> | null;
  resumen: Array<{ etiqueta: string; valor: number; tipo: TipoColumna }>;
  drilldown: boolean;
  comparativo: { periodo: { from: string; to: string }; columnaComparada: string } | null;
  nota: string | null;
};

export type DetalleReporte = {
  reporteId: string;
  clave: string;
  etiqueta: string;
  columnas: ColumnaReporte[];
  filas: FilaReporte[];
  total: number;
};

export const hoyIso = () => new Date().toISOString().slice(0, 10);

export const inicioDeMesIso = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

/** Query string sin claves vacías: el API no tiene que adivinar qué es «sin filtro». */
export function queryString(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (valor === null || valor === undefined) continue;
    const txt = String(valor).trim();
    if (txt === "" || txt === "false") continue;
    sp.set(clave, txt);
  }
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export async function pedirJson<T>(path: string, token: string): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return (await res.json()) as T;
}

function nombreDeCabecera(header: string | null, fallback: string) {
  if (!header) return fallback;
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return m?.[1] ? decodeURIComponent(m[1]) : fallback;
}

/** Descarga el CSV que produce el API con los mismos filtros de la pantalla. */
export async function descargarCsv(path: string, token: string, fallbackName: string): Promise<void> {
  const res = await fetch(buildApiUrl(path), {
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreDeCabecera(res.headers.get("Content-Disposition"), fallbackName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const formateadorNumero = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

/** Una celda según el tipo que declaró el API. */
export function Celda({ valor, tipo }: { valor: unknown; tipo: TipoColumna }): ReactNode {
  if (valor === null || valor === undefined || valor === "") {
    return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
  }
  if (tipo === "moneda") return <Money value={Number(valor) || 0} bold={false} />;
  if (tipo === "numero") return <span style={{ fontVariantNumeric: "tabular-nums" }}>{formateadorNumero.format(Number(valor) || 0)}</span>;
  if (tipo === "porcentaje") {
    return <span style={{ fontVariantNumeric: "tabular-nums" }}>{(Number(valor) || 0).toFixed(1)}%</span>;
  }
  return <span>{String(valor)}</span>;
}

/**
 * Variación con signo explícito y color sobrio: por encima del presupuesto se
 * marca en rojo apagado, por debajo se deja en el color del texto. Sin
 * semáforos: el signo ya dice de qué lado estás.
 */
export function Variacion({
  valor,
  porcentaje,
  bueno = "positivo",
}: {
  valor: number;
  porcentaje?: number | null;
  /** Qué lado se considera favorable: "positivo" (sobra presupuesto) o "negativo". */
  bueno?: "positivo" | "negativo";
}) {
  const v = Number(valor) || 0;
  const favorable = bueno === "positivo" ? v >= 0 : v <= 0;
  const signo = v > 0 ? "+" : v < 0 ? "−" : "";
  const abs = Math.abs(v).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <span
      style={{
        fontVariantNumeric: "tabular-nums",
        fontWeight: 600,
        color: favorable ? "var(--text-primary)" : "var(--danger)",
        whiteSpace: "nowrap",
      }}
      title={favorable ? "Dentro de lo presupuestado" : "Por encima de lo presupuestado"}
    >
      {signo}${abs}
      {porcentaje !== null && porcentaje !== undefined && (
        <span style={{ marginLeft: 6, fontWeight: 500, fontSize: 11, color: "var(--text-tertiary)" }}>
          {porcentaje > 0 ? "+" : porcentaje < 0 ? "−" : ""}
          {Math.abs(Number(porcentaje) || 0).toFixed(1)}%
        </span>
      )}
    </span>
  );
}

/** Construye las columnas del DataTable a partir del contrato del API. */
export function columnasDesdeApi(columnas: ColumnaReporte[]): Column<FilaReporte>[] {
  return columnas.map((c) => ({
    key: c.clave,
    label: c.etiqueta,
    align: c.alineacion ?? (c.tipo === "texto" || c.tipo === "fecha" ? "left" : "right"),
    numeric: c.tipo !== "texto" && c.tipo !== "fecha",
    render: (fila: FilaReporte) => <Celda valor={fila[c.clave]} tipo={c.tipo} />,
  }));
}

/**
 * Totales del reporte, bajo la tabla. Se muestra cada columna numérica con su
 * etiqueta en vez de fingir un renglón alineado: la tabla tiene scroll
 * horizontal y un pie «alineado» dejaría de estarlo en cuanto se desplaza.
 */
export function FilaTotales({
  columnas,
  totales,
}: {
  columnas: ColumnaReporte[];
  totales: Record<string, number> | null;
}) {
  if (!totales) return null;
  const conTotal = columnas.filter((c) => totales[c.clave] !== undefined);
  if (conTotal.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 8,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 24,
        padding: "10px 16px",
        borderRadius: "var(--nx-panel-radius)",
        border: "1px solid var(--nx-panel-hairline)",
        background: "var(--surface-2)",
        fontSize: 12.5,
      }}
    >
      <span style={{ marginRight: "auto", fontWeight: 700, color: "var(--text-secondary)" }}>Total</span>
      {conTotal.map((c) => (
        <span key={c.clave} style={{ whiteSpace: "nowrap" }}>
          <span style={{ color: "var(--text-tertiary)", marginRight: 6 }}>{c.etiqueta}</span>
          <Celda valor={totales[c.clave]} tipo={c.tipo} />
        </span>
      ))}
    </div>
  );
}

/**
 * Cifras clave del reporte, en la tira compartida de finanzas. Eran tarjetas
 * sueltas con borde propio: ocupaban el doble de alto para decir lo mismo.
 */
export function Resumen({ items }: { items: Array<{ etiqueta: string; valor: number; tipo: TipoColumna }> }) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <MetricStrip
        ariaLabel="Cifras del reporte"
        metrics={items.map((k) => ({
          label: k.etiqueta,
          value: <Celda valor={k.valor} tipo={k.tipo} />,
        }))}
      />
    </div>
  );
}

/**
 * Detalle de una línea: las transacciones que la forman. Pide el detalle al
 * abrirse, con los mismos filtros con los que se calculó el reporte.
 */
export function DetalleModal({
  abierto,
  titulo,
  path,
  token,
  onClose,
}: {
  abierto: boolean;
  titulo: string;
  path: string | null;
  token: string;
  onClose: () => void;
}) {
  const [detalle, setDetalle] = useState<DetalleReporte | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!abierto || !path || !token) {
      setDetalle(null);
      setError(null);
      return () => {
        vivo = false;
      };
    }
    setCargando(true);
    setError(null);
    pedirJson<DetalleReporte>(path, token)
      .then((d) => {
        if (vivo) setDetalle(d);
      })
      .catch((e) => {
        if (vivo) {
          setError(formatApiError(e));
          setDetalle(null);
        }
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [abierto, path, token]);

  return (
    <Modal open={abierto} onClose={onClose} title={titulo} maxWidth={900}>
      {error && <InlineAlert message={error} />}
      {cargando ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Cargando el detalle…</p>
      ) : !detalle ? (
        error ? null : <EmptyState title="Sin detalle" description="No hay transacciones para esta línea." />
      ) : detalle.filas.length === 0 ? (
        <EmptyState
          title="Sin transacciones"
          description="Esta línea no tiene movimientos registrados en el periodo seleccionado."
        />
      ) : (
        <>
          <DataTable
            columns={columnasDesdeApi(detalle.columnas)}
            rows={detalle.filas}
            rowKey={(f) => f.clave}
            density="compact"
            stickyHeader={false}
          />
          <div style={{ marginTop: 10, textAlign: "right", fontSize: 13 }}>
            <span style={{ color: "var(--text-secondary)", marginRight: 8 }}>Total de la línea</span>
            <Money value={detalle.total} />
          </div>
          {detalle.filas.length >= 500 && (
            <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
              Se muestran los primeros 500 movimientos. Exporta el reporte para verlos todos.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
