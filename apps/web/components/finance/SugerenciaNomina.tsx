"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import MetricStrip from "@/components/ui/MetricStrip";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import InlineAlert from "@/components/ui/InlineAlert";
import FilterToolbar from "@/components/FilterToolbar";
import { financeFetch } from "@/lib/finance-api";
import { formatApiError } from "@/lib/erp-api";

export type EstadoSugerencia = "ok" | "revisar" | "sin_sueldo" | "sin_jornadas";

export type FilaSugerencia = {
  userId: number;
  nombre: string;
  puesto: string | null;
  numeroEmpleado: string | null;
  horario: string;
  horasLaboradas: number;
  horasProductivas: number;
  productividadPct: number | null;
  horasEsperadas: number;
  cumplimientoPct: number | null;
  sueldoSemanal: number | null;
  horasSemanales: number;
  origenDivisor: "horario_propio" | "plantilla" | "lft";
  divisor: string;
  pagoHora: number | null;
  pagoPorLaboradas: number | null;
  pagoPorProductivas: number | null;
  sueldoPeriodo: number | null;
  montoSugerido: number | null;
  estado: EstadoSugerencia;
  sugerencia: string;
  avisos: string[];
};

export type TotalesSugerencia = {
  personas: number;
  sinSueldo: number;
  sinJornadas: number;
  revisar: number;
  horasLaboradas: number;
  horasProductivas: number;
  productividadPct: number | null;
  pagoPorLaboradas: number;
  pagoPorProductivas: number;
  sueldoPeriodo: number;
  montoSugerido: number;
};

export type SugerenciaNominaRespuesta = {
  periodo: {
    desde: string;
    hasta: string;
    etiqueta: string;
    origen: "calendario" | "por_omision" | "manual";
    enCurso: boolean;
    calculadoHasta: string;
  };
  generadoAt: string;
  scope: "company" | "subtree";
  formula: string[];
  filas: FilaSugerencia[];
  totales: TotalesSugerencia;
};

export type ModoPeriodo = "vigente" | "anterior" | "rango";

/** Misma fórmula que la API; aquí solo se enseña. */
export const NOTA_FORMULA =
  "Pago por hora = sueldo semanal ÷ horas semanales de su horario (oficina L–V de 8 h: 40 h; sin horario fijo: 48 h, la jornada legal).";

export const ESTADO_SUGERENCIA: Record<EstadoSugerencia, { label: string; tone: StatusTone }> = {
  ok: { label: "Sugerido", tone: "neutral" },
  revisar: { label: "Revisar", tone: "warning" },
  sin_sueldo: { label: "Sin sueldo", tone: "danger" },
  sin_jornadas: { label: "Sin jornadas", tone: "danger" },
};

/** Ruta de la API para el periodo elegido; `null` mientras el rango esté incompleto. */
export function rutaSugerencia(modo: ModoPeriodo, desde: string, hasta: string): string | null {
  if (modo === "rango") {
    if (!desde || !hasta || hasta < desde) return null;
    return `employee-payments/sugerencia-nomina?desde=${desde}&hasta=${hasta}`;
  }
  return `employee-payments/sugerencia-nomina?periodo=${modo}`;
}

export function formatoHoras(h: number): string {
  return `${h.toLocaleString("es-MX", { maximumFractionDigits: 2 })} h`;
}

type Renglon = { tipo: "persona"; fila: FilaSugerencia } | { tipo: "total"; totales: TotalesSugerencia };

const metaStyle: CSSProperties = { marginTop: 2, fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.35 };
const avisoStyle: CSSProperties = { ...metaStyle, color: "var(--state-warning-text)" };
const numStyle: CSSProperties = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontSize: 13 };
const toolbarButtonStyle: CSSProperties = { height: 32, fontSize: 13 };
const notaStyle: CSSProperties = {
  padding: "10px 14px",
  border: "1px solid var(--nx-panel-hairline, var(--border))",
  borderRadius: 10,
  background: "var(--surface-2, var(--surface))",
  fontSize: 12.5,
  color: "var(--text-secondary)",
  lineHeight: 1.5,
};
const statusPanelStyle: CSSProperties = { padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-tertiary)" };

const dinero = (v: number | null) => (v == null ? <span style={{ color: "var(--text-tertiary)" }}>—</span> : <Money value={v} bold={false} />);

const BAJA_PRODUCTIVIDAD = 60;

/**
 * «Sugerencia de nómina» de Pagos a empleados: horas laboradas contra productivas, pago por
 * hora y monto sugerido por persona. Solo lectura: no crea pagos.
 */
export default function SugerenciaNomina({ token }: { token: string }) {
  const [modo, setModo] = useState<ModoPeriodo>("vigente");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [datos, setDatos] = useState<SugerenciaNominaRespuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (m: ModoPeriodo, d: string, h: string) => {
      if (!token) {
        setError("Tu sesión no tiene un token válido. Vuelve a iniciar sesión.");
        return;
      }
      const ruta = rutaSugerencia(m, d, h);
      if (!ruta) {
        setError("Elige las dos fechas del rango (la final no puede ser anterior a la inicial).");
        return;
      }
      setCargando(true);
      setError(null);
      try {
        setDatos((await financeFetch(ruta, token)) as SugerenciaNominaRespuesta);
      } catch (e) {
        setError(formatApiError(e, "No se pudo calcular la sugerencia de nómina"));
      } finally {
        setCargando(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (modo !== "rango") void cargar(modo, "", "");
  }, [modo, cargar]);

  const columnas: Column<Renglon>[] = [
    {
      key: "persona",
      label: "Empleado",
      render: (r) => {
        if (r.tipo === "total") {
          return <strong style={{ fontSize: 13 }}>Total · {r.totales.personas} personas</strong>;
        }
        const f = r.fila;
        return (
          <div style={{ minWidth: 0, maxWidth: 360 }}>
            <Link
              href={`/erp/hr/${f.userId}`}
              style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", textDecoration: "none" }}
            >
              {f.nombre}
            </Link>
            <div style={metaStyle}>{f.sugerencia}</div>
            {f.avisos.map((a) => (
              <div key={a} style={avisoStyle}>
                {a}
              </div>
            ))}
          </div>
        );
      },
    },
    {
      key: "laboradas",
      label: "Laboradas",
      align: "right",
      numeric: true,
      render: (r) => {
        const h = r.tipo === "total" ? r.totales.horasLaboradas : r.fila.horasLaboradas;
        return (
          <div style={numStyle}>
            {formatoHoras(h)}
            {r.tipo === "persona" && r.fila.horasEsperadas > 0 ? (
              <div style={metaStyle}>de {formatoHoras(r.fila.horasEsperadas)}</div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "productivas",
      label: "Productivas",
      align: "right",
      numeric: true,
      render: (r) => (
        <span style={numStyle}>{formatoHoras(r.tipo === "total" ? r.totales.horasProductivas : r.fila.horasProductivas)}</span>
      ),
    },
    {
      key: "pct",
      label: "% product.",
      align: "right",
      numeric: true,
      render: (r) => {
        const p = r.tipo === "total" ? r.totales.productividadPct : r.fila.productividadPct;
        if (p == null) return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
        const bajo = p < BAJA_PRODUCTIVIDAD;
        return <span style={{ ...numStyle, color: bajo ? "var(--state-warning-text)" : undefined }}>{p} %</span>;
      },
    },
    {
      key: "pagoHora",
      label: "Pago/hora",
      align: "right",
      numeric: true,
      render: (r) =>
        r.tipo === "total" ? null : (
          <div style={numStyle} title={r.fila.divisor}>
            {dinero(r.fila.pagoHora)}
            <div style={metaStyle}>÷ {r.fila.horasSemanales} h</div>
          </div>
        ),
    },
    {
      key: "porLaboradas",
      label: "Por laboradas",
      align: "right",
      numeric: true,
      render: (r) => dinero(r.tipo === "total" ? r.totales.pagoPorLaboradas : r.fila.pagoPorLaboradas),
    },
    {
      key: "porProductivas",
      label: "Por productivas",
      align: "right",
      numeric: true,
      render: (r) => dinero(r.tipo === "total" ? r.totales.pagoPorProductivas : r.fila.pagoPorProductivas),
    },
    {
      key: "sugerido",
      label: "Sugerido",
      align: "right",
      numeric: true,
      render: (r) => {
        if (r.tipo === "total") return <Money value={r.totales.montoSugerido} />;
        const f = r.fila;
        const estado = ESTADO_SUGERENCIA[f.estado];
        return (
          <div style={{ textAlign: "right" }}>
            {f.montoSugerido == null ? <span style={{ color: "var(--text-tertiary)" }}>—</span> : <Money value={f.montoSugerido} />}
            <div style={{ marginTop: 2, display: "flex", justifyContent: "flex-end" }}>
              <StatusDot label={estado.label} tone={estado.tone} />
            </div>
            {f.sueldoPeriodo != null ? (
              <div style={metaStyle}>
                Sueldo del periodo <Money value={f.sueldoPeriodo} bold={false} />
              </div>
            ) : null}
          </div>
        );
      },
    },
  ];

  const renglones: Renglon[] = datos
    ? [
        ...datos.filas.map((fila) => ({ tipo: "persona" as const, fila })),
        ...(datos.filas.length ? [{ tipo: "total" as const, totales: datos.totales }] : []),
      ]
    : [];
  const t = datos?.totales;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <FilterToolbar
        selects={[
          {
            label: "Periodo",
            value: modo,
            onChange: (v) => setModo(v as ModoPeriodo),
            options: [
              { value: "vigente", label: "Periodo vigente" },
              { value: "anterior", label: "Periodo anterior" },
              { value: "rango", label: "Rango de fechas" },
            ],
          },
        ]}
        dates={
          modo === "rango"
            ? [
                { label: "Desde", value: desde, onChange: setDesde },
                { label: "Hasta", value: hasta, onChange: setHasta },
              ]
            : undefined
        }
        style={{ marginBottom: 0 }}
        rightActions={
          <Button
            size="sm"
            variant="secondary"
            style={toolbarButtonStyle}
            onClick={() => void cargar(modo, desde, hasta)}
            disabled={cargando}
          >
            {cargando ? "Calculando…" : modo === "rango" ? "Aplicar" : "Actualizar"}
          </Button>
        }
      />

      <div style={notaStyle} role="note">
        <strong style={{ color: "var(--text-primary)" }}>{NOTA_FORMULA}</strong>
        <div>
          Es una sugerencia: no genera pagos. Las horas productivas solo cuentan lo que cae entre la entrada y la salida.
        </div>
        {datos?.formula?.length ? (
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: "pointer" }}>¿Cómo se calcula?</summary>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {datos.formula.map((linea) => (
                <li key={linea}>{linea}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {error && (
        <InlineAlert
          message={error}
          variant="danger"
          style={{ marginBottom: 0 }}
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" variant="secondary" style={toolbarButtonStyle} onClick={() => void cargar(modo, desde, hasta)}>
              Reintentar
            </Button>
          }
        />
      )}

      {datos && (
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          {datos.periodo.origen === "manual" ? "Rango" : "Periodo"} {datos.periodo.etiqueta} ({datos.periodo.desde} al {datos.periodo.hasta})
          {datos.periodo.enCurso ? ` · en curso: lo esperado se cuenta hasta el ${datos.periodo.calculadoHasta}` : ""}
          {datos.periodo.origen === "por_omision" ? " · la empresa no tiene calendario de nómina: se asume quincenal" : ""}
          {datos.scope === "subtree" ? " · solo tu organigrama" : ""}
        </div>
      )}

      {t && t.personas > 0 && (
        <MetricStrip
          ariaLabel="Totales de la sugerencia de nómina"
          metrics={[
            { label: "Sugerido", value: <Money value={t.montoSugerido} />, hint: `sueldo del periodo ${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(t.sueldoPeriodo)}` },
            { label: "Horas laboradas", value: formatoHoras(t.horasLaboradas), hint: `${formatoHoras(t.horasProductivas)} productivas` },
            {
              label: "Productividad",
              value: t.productividadPct == null ? "—" : `${t.productividadPct} %`,
              hint: "productivas ÷ laboradas",
              tone: t.productividadPct != null && t.productividadPct < BAJA_PRODUCTIVIDAD ? "warning" : "default",
            },
            {
              label: "Por revisar",
              value: t.revisar + t.sinSueldo + t.sinJornadas,
              hint: `${t.revisar} baja productividad · ${t.sinSueldo} sin sueldo · ${t.sinJornadas} sin jornadas`,
              tone: t.revisar + t.sinSueldo + t.sinJornadas > 0 ? "warning" : "default",
            },
          ]}
        />
      )}

      {cargando && !datos ? (
        <div style={statusPanelStyle} role="status" aria-live="polite">
          Calculando la sugerencia de nómina…
        </div>
      ) : datos ? (
        <DataTable
          columns={columnas}
          rows={renglones}
          rowKey={(r) => (r.tipo === "total" ? "total" : r.fila.userId)}
          density="compact"
          ariaLabel="Sugerencia de nómina por persona"
          emptyTitle="Nadie en el periodo"
          emptyDescription="No hay empleados activos a tu alcance para este periodo."
        />
      ) : modo === "rango" && !error ? (
        <div style={statusPanelStyle}>Elige las fechas y pulsa «Aplicar».</div>
      ) : null}
    </div>
  );
}
