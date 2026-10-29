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
  /** «A la fecha»: lo esperado contado hasta ayer. */
  montoSugerido: number | null;
  devengadoALaFecha?: number | null;
  /** «Periodo completo»: lo de a la fecha más el sueldo de los días que faltan. */
  proyectado?: number | null;
  diasALaFecha?: number;
  diasRestantes?: number;
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
  devengadoALaFecha?: number;
  proyectado?: number;
};

/** Periodos que el selector ofrece sin escribir fechas (la API los calcula con la fecha de hoy). */
export const PERIODOS_CALCULADOS = [
  { clave: "semana", label: "Semana actual" },
  { clave: "semana_anterior", label: "Semana anterior" },
  { clave: "quincena", label: "Quincena actual" },
  { clave: "quincena_anterior", label: "Quincena anterior" },
  { clave: "mes", label: "Mes actual" },
  { clave: "mes_anterior", label: "Mes anterior" },
] as const;
export type ClavePeriodo = (typeof PERIODOS_CALCULADOS)[number]["clave"];

export type SugerenciaNominaRespuesta = {
  periodo: {
    desde: string;
    hasta: string;
    etiqueta: string;
    origen: "calendario" | "por_omision" | "manual" | "calculado";
    clave?: ClavePeriodo;
    /** Día en que se paga (semana: el lunes siguiente al corte del domingo). */
    pagoEl?: string;
    enCurso: boolean;
    calculadoHasta: string;
  };
  /** Los periodos del selector con sus fechas (API nueva). */
  periodos?: Array<{ clave: ClavePeriodo; desde: string; hasta: string; etiqueta: string; pagoEl?: string }>;
  generadoAt: string;
  scope: "company" | "subtree";
  formula: string[];
  filas: FilaSugerencia[];
  totales: TotalesSugerencia;
};

/** `vigente`/`anterior` = calendario de la empresa (rutas viejas); el selector usa los calculados. */
export type ModoPeriodo = ClavePeriodo | "vigente" | "anterior" | "rango";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «26 oct», «1 nov» (y el año si no es el de la otra fecha). */
export function fechaCorta(iso: string, conAnio = false): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MESES_CORTOS[m - 1]}${conAnio ? ` ${y}` : ""}`;
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «lunes 2 nov». */
export function diaYFecha(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${fechaCorta(iso)}`;
}

/** Encabezado de la semana de pago: «Semana del 26 oct al 1 nov · se paga el lunes 2 nov». */
export function encabezadoSemana(desde: string, hasta: string, pagoEl?: string | null): string {
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);
  const inicio = mismoMes ? String(Number(desde.slice(8, 10))) : fechaCorta(desde);
  return `Semana del ${inicio} al ${fechaCorta(hasta)}${pagoEl ? ` · se paga el ${diaYFecha(pagoEl)}` : ""}`;
}

/** «26 oct – 1 nov»; con el año en las dos si cruza de año. */
export function rangoCorto(desde: string, hasta: string): string {
  const cruza = desde.slice(0, 4) !== hasta.slice(0, 4);
  return `${fechaCorta(desde, cruza)} – ${fechaCorta(hasta, cruza)}`;
}

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
const periodoStyle: CSSProperties = { fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.45 };

const NOTA_SUGERENCIA =
  "Es una sugerencia que no genera pagos: las horas productivas solo cuentan lo que cae entre la entrada y la salida.";

/** Etiqueta, fechas y avisos del periodo, en una sola frase. */
function partesPeriodo(datos: SugerenciaNominaRespuesta): string[] {
  const p = datos.periodo;
  // La nómina se paga por semana: su encabezado dice las fechas y el día de pago, sin quincenas.
  const partes = p.clave?.startsWith("semana")
    ? [encabezadoSemana(p.desde, p.hasta, p.pagoEl)]
    : [`${p.origen === "manual" ? "Rango" : "Periodo"} ${p.etiqueta}`, `del ${p.desde} al ${p.hasta}`];
  if (p.enCurso) {
    partes.push(`en curso: lo esperado se cuenta hasta el ${p.calculadoHasta}`);
    partes.push(`«a la fecha» corta el ${fechaCorta(p.calculadoHasta)} y «periodo completo» el ${fechaCorta(p.hasta)}`);
  }
  if (p.origen === "por_omision") partes.push("la empresa no tiene calendario de nómina: se asume semanal, de lunes a domingo");
  if (datos.scope === "subtree") partes.push("solo tu organigrama");
  return partes;
}

/** Una frase en ancho de escritorio; a 390 px, un dato por renglón. */
function FraseDatos({ partes }: { partes: string[] }) {
  const ultimo = partes.length - 1;
  return (
    <>
      {partes.map((parte, i) => (
        <span key={i} className="nx-sn-dato">
          {i > 0 ? <span className="nx-sn-sep">{i === ultimo && ultimo > 1 ? " y " : ", "}</span> : null}
          {parte}
        </span>
      ))}
      <span className="nx-sn-sep">.</span>
    </>
  );
}

const dinero = (v: number | null) => (v == null ? <span style={{ color: "var(--text-tertiary)" }}>—</span> : <Money value={v} bold={false} />);

const BAJA_PRODUCTIVIDAD = 60;

/**
 * «Sugerencia de nómina» de Pagos a empleados: horas laboradas contra productivas, pago por
 * hora y monto sugerido por persona. Solo lectura: no crea pagos.
 */
export default function SugerenciaNomina({ token }: { token: string }) {
  // La nómina se paga cada semana (Adam, 29-10): se abre en la semana en curso.
  const [modo, setModo] = useState<ModoPeriodo>("semana");
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

  const enCurso = Boolean(datos?.periodo.enCurso);
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
            {enCurso && f.proyectado != null ? (
              <div style={metaStyle}>
                Periodo completo al {fechaCorta(datos!.periodo.hasta)} <Money value={f.proyectado} bold={false} />
              </div>
            ) : null}
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
  const fechasDe = new Map((datos?.periodos ?? []).map((p) => [p.clave, rangoCorto(p.desde, p.hasta)]));
  const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <FilterToolbar
        selects={[
          {
            label: "Periodo",
            value: modo,
            onChange: (v) => setModo(v as ModoPeriodo),
            options: [
              ...PERIODOS_CALCULADOS.map((p) => ({
                value: p.clave,
                label: fechasDe.has(p.clave) ? `${p.label} · ${fechasDe.get(p.clave)}` : p.label,
              })),
              { value: "rango", label: "Rango personalizado" },
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
        <div>{NOTA_SUGERENCIA}</div>
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
        <div style={periodoStyle}>
          <FraseDatos partes={partesPeriodo(datos)} />
        </div>
      )}

      {t && t.personas > 0 && (
        <MetricStrip
          ariaLabel="Totales de la sugerencia de nómina"
          metrics={[
            {
              label: enCurso ? `Sugerido al ${fechaCorta(datos!.periodo.calculadoHasta)}` : "Sugerido",
              value: <Money value={t.montoSugerido} />,
              hint:
                enCurso && t.proyectado != null
                  ? `periodo completo al ${fechaCorta(datos!.periodo.hasta)}: ${MXN.format(t.proyectado)}`
                  : `sueldo del periodo ${MXN.format(t.sueldoPeriodo)}`,
            },
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
              hint: (
                <FraseDatos
                  partes={[`${t.revisar} baja productividad`, `${t.sinSueldo} sin sueldo`, `${t.sinJornadas} sin jornadas`]}
                />
              ),
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
      <style>{`
        @media (max-width: 480px) {
          .nx-sn-dato { display: block; }
          .nx-sn-sep { display: none; }
        }
      `}</style>
    </div>
  );
}
