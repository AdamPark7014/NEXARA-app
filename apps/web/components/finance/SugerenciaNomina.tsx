"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  DateInput,
  ListCard,
  ModuleToolbar,
  Select,
  SkeletonRows,
  Stat,
  StatRow,
  type Column,
  type Tone,
} from "@/components/base";
import { Money } from "@/components/ui/DataTable";
import { financeFetch } from "@/lib/finance-api";
import { formatApiError } from "@/lib/erp-api";
import s from "./SugerenciaNomina.module.css";

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

export const ESTADO_SUGERENCIA: Record<EstadoSugerencia, { label: string; tone: Tone }> = {
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
        <span key={i} className={s.dato}>
          {i > 0 ? <span className={s.sep}>{i === ultimo && ultimo > 1 ? " y " : ", "}</span> : null}
          {parte}
        </span>
      ))}
      <span className={s.sep}>.</span>
    </>
  );
}

const dinero = (v: number | null) => (v == null ? <span className={s.tenue}>—</span> : <Money value={v} bold={false} />);

const BAJA_PRODUCTIVIDAD = 60;

/** Mientras llega el cálculo: renglones esqueleto y, para el lector de pantalla, la frase de siempre. */
function Calculando() {
  return (
    <>
      <SkeletonRows rows={5} label="Calculando la sugerencia de nómina…" />
      <span className="ui-sr-only" role="status" aria-live="polite">
        Calculando la sugerencia de nómina…
      </span>
    </>
  );
}

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
          return <strong className={s.total}>Total · {r.totales.personas} personas</strong>;
        }
        const f = r.fila;
        return (
          <div className={s.celdaPersona}>
            <Link href={`/erp/hr/${f.userId}`} className={s.nombre}>
              {f.nombre}
            </Link>
            <div className={s.meta}>{f.sugerencia}</div>
            {f.avisos.map((a) => (
              <div key={a} className={s.aviso}>
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
          <div className={s.num}>
            {formatoHoras(h)}
            {r.tipo === "persona" && r.fila.horasEsperadas > 0 ? (
              <div className={s.meta}>de {formatoHoras(r.fila.horasEsperadas)}</div>
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
        <span className={s.num}>{formatoHoras(r.tipo === "total" ? r.totales.horasProductivas : r.fila.horasProductivas)}</span>
      ),
    },
    {
      key: "pct",
      label: "% product.",
      align: "right",
      numeric: true,
      render: (r) => {
        const p = r.tipo === "total" ? r.totales.productividadPct : r.fila.productividadPct;
        if (p == null) return <span className={s.tenue}>—</span>;
        const bajo = p < BAJA_PRODUCTIVIDAD;
        return <span className={bajo ? `${s.num} ${s.bajo}` : s.num}>{p} %</span>;
      },
    },
    {
      key: "pagoHora",
      label: "Pago/hora",
      align: "right",
      numeric: true,
      render: (r) =>
        r.tipo === "total" ? null : (
          <div className={s.num} title={r.fila.divisor}>
            {dinero(r.fila.pagoHora)}
            <div className={s.meta}>÷ {r.fila.horasSemanales} h</div>
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
          <div className={s.sugerido}>
            {f.montoSugerido == null ? <span className={s.tenue}>—</span> : <Money value={f.montoSugerido} />}
            <div className={s.sugeridoEstado}>
              <Badge dot size="sm" tone={estado.tone}>
                {estado.label}
              </Badge>
            </div>
            {enCurso && f.proyectado != null ? (
              <div className={s.meta}>
                Periodo completo al {fechaCorta(datos!.periodo.hasta)} <Money value={f.proyectado} bold={false} />
              </div>
            ) : null}
            {f.sueldoPeriodo != null ? (
              <div className={s.meta}>
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
  const porRevisar = t ? t.revisar + t.sinSueldo + t.sinJornadas : 0;

  const esperandoCalculo = cargando && !datos;
  const esperandoRango = !datos && !cargando && modo === "rango" && !error;

  return (
    <div className={s.pantalla}>
      <Card as="div" className={s.barra}>
        <ModuleToolbar
          end={
            <Button
              size="sm"
              variant={modo === "rango" ? "tonal" : "ghost"}
              onClick={() => void cargar(modo, desde, hasta)}
              disabled={cargando}
            >
              {cargando ? "Calculando…" : modo === "rango" ? "Aplicar" : "Actualizar"}
            </Button>
          }
        >
          <Select
            aria-label="Periodo"
            title="Periodo"
            controlSize="sm"
            wrapperClassName={s.filtroPeriodo}
            value={modo}
            onChange={(e) => setModo(e.target.value as ModoPeriodo)}
          >
            <option value="">Todos · Periodo</option>
            {PERIODOS_CALCULADOS.map((p) => (
              <option key={p.clave} value={p.clave}>
                {fechasDe.has(p.clave) ? `${p.label} · ${fechasDe.get(p.clave)}` : p.label}
              </option>
            ))}
            <option value="rango">Rango personalizado</option>
          </Select>
          {modo === "rango" ? (
            <>
              <label className={s.fecha}>
                <span>Desde</span>
                <DateInput
                  aria-label="Desde"
                  controlSize="sm"
                  className={s.fechaCtl}
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </label>
              <label className={s.fecha}>
                <span>Hasta</span>
                <DateInput
                  aria-label="Hasta"
                  controlSize="sm"
                  className={s.fechaCtl}
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                />
              </label>
            </>
          ) : null}
        </ModuleToolbar>
      </Card>

      {error && (
        <Alert
          tone="danger"
          role="alert"
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" variant="secondary" onClick={() => void cargar(modo, desde, hasta)}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <div className={s.nota} role="note">
        <strong>{NOTA_FORMULA}</strong>
        <div>{NOTA_SUGERENCIA}</div>
        {datos?.formula?.length ? (
          <details className={s.formula}>
            <summary>¿Cómo se calcula?</summary>
            <ul>
              {datos.formula.map((linea) => (
                <li key={linea}>{linea}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {datos && (
        <div className={s.periodo}>
          <FraseDatos partes={partesPeriodo(datos)} />
        </div>
      )}

      {t && t.personas > 0 && (
        <StatRow variant="strip" ariaLabel="Totales de la sugerencia de nómina">
          <Stat
            label={enCurso ? `Sugerido al ${fechaCorta(datos!.periodo.calculadoHasta)}` : "Sugerido"}
            value={<Money value={t.montoSugerido} />}
            hint={
              enCurso && t.proyectado != null
                ? `periodo completo al ${fechaCorta(datos!.periodo.hasta)}: ${MXN.format(t.proyectado)}`
                : `sueldo del periodo ${MXN.format(t.sueldoPeriodo)}`
            }
            icon={<PaymentsOutlinedIcon />}
            iconTone="neutral"
          />
          <Stat
            label="Horas laboradas"
            value={formatoHoras(t.horasLaboradas)}
            hint={`${formatoHoras(t.horasProductivas)} productivas`}
            icon={<ScheduleOutlinedIcon />}
            iconTone="neutral"
          />
          <Stat
            label="Productividad"
            value={t.productividadPct == null ? "—" : `${t.productividadPct} %`}
            hint="productivas ÷ laboradas"
            tone={t.productividadPct != null && t.productividadPct < BAJA_PRODUCTIVIDAD ? "warning" : "default"}
            icon={<SpeedOutlinedIcon />}
            iconTone="neutral"
          />
          <Stat
            label="Por revisar"
            value={porRevisar}
            hint={
              <FraseDatos
                partes={[`${t.revisar} baja productividad`, `${t.sinSueldo} sin sueldo`, `${t.sinJornadas} sin jornadas`]}
              />
            }
            tone={porRevisar > 0 ? "warning" : "default"}
            icon={<FactCheckOutlinedIcon />}
            iconTone="neutral"
          />
        </StatRow>
      )}

      <ListCard
        empty={esperandoRango || (Boolean(datos) && renglones.length === 0)}
        emptyState={
          esperandoRango
            ? {
                icon: <CalendarMonthOutlinedIcon />,
                title: "Elige las fechas y pulsa «Aplicar».",
                tone: "neutral",
              }
            : {
                icon: <PeopleAltOutlinedIcon />,
                title: "Nadie en el periodo",
                description: "No hay empleados activos a tu alcance para este periodo.",
                tone: "neutral",
              }
        }
      >
        {esperandoCalculo ? (
          <Calculando />
        ) : datos ? (
          <DataTable
            flush
            columns={columnas}
            rows={renglones}
            rowKey={(r) => (r.tipo === "total" ? "total" : r.fila.userId)}
            density="compact"
            ariaLabel="Sugerencia de nómina por persona"
            loading={cargando}
          />
        ) : null}
      </ListCard>
    </div>
  );
}
