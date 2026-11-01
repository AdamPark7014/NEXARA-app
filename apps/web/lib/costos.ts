/**
 * NEXARA · Costos (libro de costos, tarifas y bandeja de horas sin proyecto).
 *
 * Contrato con `/api/costos/**` y las reglas puras de las pantallas, probadas en `costos.spec.ts`.
 * Los porcentajes de los parámetros viajan como fracción (0.25 = 25 %); los de margen, como 0–100.
 * Ver `docs/COSTOS-PRECIOS-UNITARIOS.md`.
 */
import { erpFetch } from "@/lib/erp-api";

const API = "/costos";

const json = (cuerpo: unknown, method = "POST"): RequestInit => ({ method, body: JSON.stringify(cuerpo) });

/* ── Tipos ────────────────────────────────────────────────────────────────── */

export type Acceso = { veTodo: boolean; puedeLigar: boolean };

export type TipoLiga = "PROYECTO" | "COTIZACION" | "INTERNA";

export type Sugerencia = { tipo: TipoLiga; id: number | null; nombre: string; motivo: string; fuente: "REGLA" | "IA" };

export type FilaPorLigar = {
  activityId: number;
  folio: string;
  titulo: string;
  coreKind: string | null;
  cliente: string | null;
  horas: number;
  personas: number;
  dias: number;
  sugerencia: Sugerencia | null;
};

export type Candidato = { tipo: "PROYECTO" | "COTIZACION"; id: number; nombre: string; cliente?: string | null };

export type Periodo = "semana" | "mes" | "todo";

export type Bandeja = {
  periodo: Periodo;
  resumen: {
    horasTotal: number;
    horasLigadas: number;
    horasPorLigar: number;
    actividades: number;
    pctLigado: number | null;
    conSugerencia: number;
  };
  iaDisponible: boolean;
  filas: FilaPorLigar[];
  candidatos: Candidato[];
};

export type Parametros = {
  anio: number;
  ps: number;
  psValidado: boolean;
  otrosDias: number;
  aguinaldoDias: number;
  primaVacacional: number;
  kh: number;
  ks: number;
  indirectoPct: number | null;
  tasaInteres: number | null;
  notas: string | null;
  guardado: boolean;
  actualizadoEn: string | null;
};

export type Categoria = {
  id: number;
  clave: string;
  nombre: string;
  tipo: "DIRECTO" | "INDIRECTO";
  activo: boolean;
  sueldoSemanalRef: number | null;
  personas: number;
  costoHora: number | null;
  origenTarifa: "REFERENCIA" | "PROMEDIO";
};

export type PersonaTarifa = {
  userId: number;
  nombre: string;
  puesto: string | null;
  categoriaId: number | null;
  categoriaAsignada: boolean;
  psPropio: number | null;
  sueldoSemanal: number;
  vacacionesDias: number;
  fsr: number;
  costoHora: number;
  sinSueldo: boolean;
};

export type TarifaEquipo = {
  d: number;
  im: number;
  sm: number;
  mn: number;
  co: number;
  lb: number;
  n: number;
  otros: number;
  fijos: number;
  consumos: number;
  total: number;
};

export type UnidadEquipo = "KM" | "HORA" | "DIA";

export type DatosEquipo = {
  tipo: "VEHICULO" | "HERRAMIENTA";
  nombre: string;
  unidad: UnidadEquipo;
  vehicleId?: number | null;
  toolId?: number | null;
  valor: number;
  valorLlantas?: number;
  rescatePct?: number;
  vidaUnidades: number;
  unidadesAnio: number;
  tasaInteres?: number;
  primaSeguro?: number;
  ko?: number;
  rendimiento?: number;
  precioCombustible?: number;
  costoAceite?: number;
  aceiteCadaUnidades?: number;
  vidaLlantasUnidades?: number;
  otrosAnuales?: number;
  notas?: string | null;
};

export type Equipo = DatosEquipo & { id: number; tarifa: TarifaEquipo };

export type Tarifas = {
  anio: number;
  parametros: Parametros;
  factor: { tp: number; tl: number; tpTl: number; fsr: number; diasHabiles: number; festivosEnDiaHabil: number; vacacionesDias: number };
  categorias: Categoria[];
  personas: PersonaTarifa[];
  equipos: Equipo[];
  vehiculos: Array<{ id: number; nombre: string; placas: string | null }>;
  herramientas: Array<{ id: number; nombre: string; codigo: string | null }>;
  avisos: { psSinValidar: boolean; personasSinSueldo: number; personasSinCategoria: number; vehiculosSinFicha: number };
};

export type Rubro = "MATERIAL" | "MANO_OBRA" | "VEHICULO" | "HERRAMIENTA" | "VIATICO_GASTO" | "SUBCONTRATO";

export type Margen = { importe: number; pct: number | null };

export type CostosProyecto = {
  proyecto: { id: number; titulo: string; cotizacion: string | null; cotizacionId: number | null };
  venta: number | null;
  rubros: Array<{ rubro: Rubro; etiqueta: string; cotizado: number | null; real: number }>;
  directo: { cotizado: number | null; real: number };
  indirecto: { pct: number | null; cotizado: number | null; real: number | null };
  margen: { cotizado: Margen | null; hoy: Margen | null };
  manoDeObra: { horas: number; categorias: Array<{ categoria: string; horas: number; importe: number }> | null };
  avisos: {
    sinCotizacion: boolean;
    sinVenta: boolean;
    partidasSinCosto: number;
    partidas: number;
    indirectoSinCapturar: boolean;
    sesionesSinSueldo: number;
    sesionesRecortadas: number;
    salidasSinCosto: number;
    psSinValidar: boolean;
  };
  acceso: { detalle: boolean };
};

export type ListaProyectos = {
  proyectos: Array<{
    id: number;
    titulo: string;
    estado: string;
    cliente: string | null;
    cotizacion: string | null;
    venta: number | null;
    costo: number;
    real: Record<Rubro, number>;
    margen: Margen | null;
  }>;
  cotizacionesSinProyecto: Array<{
    id: number;
    folio: string;
    nombre: string;
    clienteId: number | null;
    costo: number;
    real: Record<Rubro, number>;
  }>;
  manoDeObra: {
    horas: number;
    importe: number;
    horasSinLigar: number;
    importeSinLigar: number;
    horasInternas: number;
    importeInterno: number;
  };
};

/* ── API ──────────────────────────────────────────────────────────────────── */

export const getAcceso = (token: string) => erpFetch<Acceso>(`${API}/acceso`, token);

export const getBandeja = (token: string, periodo: Periodo) =>
  erpFetch<Bandeja>(`${API}/por-ligar?periodo=${periodo}`, token);

export const ligarActividad = (token: string, activityId: number, tipo: TipoLiga, id?: number | null) =>
  erpFetch<{ ok: true }>(`${API}/por-ligar/${activityId}`, token, json({ tipo, id: id ?? null }));

export const deshacerLiga = (token: string, activityId: number) =>
  erpFetch<{ ok: true }>(`${API}/por-ligar/${activityId}`, token, { method: "DELETE" });

export const sugerirConIa = (token: string, periodo: Periodo) =>
  erpFetch<{ consultadas: number; sugeridas: number; iaDisponible: boolean }>(`${API}/por-ligar/sugerir`, token, json({ periodo }));

export const getTarifas = (token: string, anio?: number) =>
  erpFetch<Tarifas>(`${API}/tarifas${anio ? `?anio=${anio}` : ""}`, token);

export const guardarParametros = (token: string, anio: number, cambios: Partial<Parametros>) =>
  erpFetch<Parametros>(`${API}/parametros/${anio}`, token, json(cambios, "PUT"));

export const editarCategoria = (
  token: string,
  id: number,
  cambios: { nombre?: string; tipo?: string; sueldoSemanalRef?: number | null },
) => erpFetch(`${API}/categorias/${id}`, token, json(cambios, "PATCH"));

export const asignarPersona = (
  token: string,
  userId: number,
  cambios: { categoriaId?: number | null; psPropio?: number | null },
) => erpFetch(`${API}/personas/${userId}`, token, json(cambios, "PUT"));

export const crearEquipo = (token: string, datos: DatosEquipo) => erpFetch<Equipo>(`${API}/fichas`, token, json(datos));

export const editarEquipo = (token: string, id: number, datos: Partial<DatosEquipo>) =>
  erpFetch<Equipo>(`${API}/fichas/${id}`, token, json(datos, "PATCH"));

export const quitarEquipo = (token: string, id: number) => erpFetch(`${API}/fichas/${id}`, token, { method: "DELETE" });

export const recalcularLibro = (token: string) =>
  erpFetch<{ creados: number; actualizados: number; borrados: number; total: number }>(`${API}/recalcular`, token, { method: "POST" });

export const getListaProyectos = (token: string) => erpFetch<ListaProyectos>(`${API}/proyectos`, token);

export const getCostosProyecto = (token: string, id: number) => erpFetch<CostosProyecto>(`${API}/proyectos/${id}`, token);

/* ── Reglas puras ─────────────────────────────────────────────────────────── */

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const MXN2 = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

export const pesos = (n: number | null | undefined) => (n == null ? "—" : MXN.format(n));
export const pesos2 = (n: number | null | undefined) => (n == null ? "—" : MXN2.format(n));
export const horas = (n: number | null | undefined) => (n == null ? "—" : `${NUM.format(n)} h`);
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${NUM.format(n)} %`);

/** Fracción a texto de porcentaje para un campo («0.25» → «25»). */
export const fraccionATexto = (f: number | null | undefined) =>
  f == null ? "" : String(Math.round(f * 10000) / 100);

/** Texto de porcentaje a fracción; vacío o inválido, null. */
export function textoAFraccion(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 10000 : null;
}

export type Tono = "ok" | "atencion" | "mal" | "neutro";

/** Real contra cotizado: en verde hasta el 100 %, en ámbar hasta 115 %, y en rojo después. */
export function tonoDeAvance(real: number, cotizado: number | null): Tono {
  if (cotizado == null || cotizado <= 0) return "neutro";
  const r = real / cotizado;
  if (r <= 1) return "ok";
  return r <= 1.15 ? "atencion" : "mal";
}

/** La barra pone el 100 % a dos tercios del ancho, para que se vea cuánto se pasó. */
export function anchoDeBarra(real: number, cotizado: number | null): number {
  if (cotizado == null || cotizado <= 0) return 0;
  return Math.max(0, Math.min(100, ((real / cotizado) * 100) / 1.5));
}

export const pctDeAvance = (real: number, cotizado: number | null): number | null =>
  cotizado == null || cotizado <= 0 ? null : Math.round((real / cotizado) * 100);

/** Tono de un margen: bajo 5 % es rojo; negativo también. */
export function tonoDeMargen(p: number | null | undefined): Tono {
  if (p == null) return "neutro";
  if (p < 5) return "mal";
  return p < 15 ? "atencion" : "ok";
}

const ETIQUETA_TIPO: Record<string, string> = {
  tarea: "Tarea",
  proyecto: "Proyecto",
  obra: "Obra",
  servicio: "Servicio",
  comercial: "Comercial",
};

/** «Tarea · 2 personas · 3 días». */
export function detalleDeFila(f: Pick<FilaPorLigar, "coreKind" | "personas" | "dias">): string {
  return [
    ETIQUETA_TIPO[String(f.coreKind ?? "")] ?? null,
    f.personas === 1 ? "1 persona" : `${f.personas} personas`,
    f.dias === 1 ? "1 día" : `${f.dias} días`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function filtrarCandidatos(lista: readonly Candidato[], texto: string, tope = 40): Candidato[] {
  const q = quitarAcentos(texto);
  const salida = q ? lista.filter((c) => quitarAcentos(`${c.nombre} ${c.cliente ?? ""}`).includes(q)) : lista;
  return salida.slice(0, tope);
}

function quitarAcentos(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Liga para abrir un proyecto ya con su cotización; el formulario lee estos parámetros. */
export function rutaProyectoDesdeCotizacion(cotizacionId: number, clienteId?: number | null): string {
  const qs = new URLSearchParams({ cotizacionId: String(cotizacionId) });
  if (clienteId) qs.set("clienteId", String(clienteId));
  return `/erp/proyectos/nuevo?${qs.toString()}`;
}
