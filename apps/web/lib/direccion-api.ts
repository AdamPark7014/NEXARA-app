/**
 * Hoy de dirección, Mi área y Obra (Velocidad Core, Ola 5). Las cuentas son de la API
 * (`apps/api/src/me/direccion.ts`); aquí solo los tipos, las llamadas y cómo se escribe cada cifra.
 */
import { erpFetch } from "@/lib/erp-api";

/**
 * Adam la ve primero en la pantalla real: `/erp/executive?muestra=1`, `/erp/pizarra/area` y
 * `/erp/proyectos/obra`. Con `false` nadie llega por el menú ni por la pantalla Hoy.
 */
export const DIRECCION_VISIBLE = false;

export type ResumenGente = {
  personas: number;
  medidas: number;
  aTiempo: number;
  pctATiempo: number | null;
  esperados: number;
  puntuales: number;
  pctPuntual: number | null;
  diasSinChecada: number;
  porRevisar: number;
};

export type FilaArea = {
  id: number;
  nombre: string;
  puesto: string | null;
  avatarUrl: string | null;
  entregas: number;
  pctATiempo: number | null;
  pctPuntual: number | null;
  diasSinChecada: number;
  porRevisar: number;
  queLePasa: string | null;
};

export type AreaResponse = {
  encargado: { id: number; nombre: string; puesto: string | null };
  desde: string;
  hasta: string;
  resumen: ResumenGente;
  gente: FilaArea[];
};

export type FilaEncargado = {
  tipo: "equipo" | "revisor" | "directos";
  id: number;
  nombre: string;
  area: string | null;
  aCargo: number;
  pctATiempo: number | null;
  pctPuntual: number | null;
  porRevisar: number;
  pesa: string | null;
};

export type DireccionHoy = {
  generadoAt: string;
  hoy: {
    checaron: number;
    de: number;
    fecha: string | null;
    pctATiempo: number | null;
    aTiempo: number;
    medidas: number;
    pctPuntual: number | null;
    puntuales: number;
    esperados: number;
    evidenciasSinRevisar: number;
    conSuJefe: number;
    cotizacionesPorVencer: number | null;
  };
  resolvioSolo: { revisionesDeJefes: number; revisiones: number; avisos: number | null; salidasDeshechas: number | null };
  porEncargado: FilaEncargado[];
  obra: { id: number; nombre: string; actividades: number; ligadas: number } | null;
  modulos: {
    porValidar: number | null;
    cotizaciones: { borrador: number | null; enviadas: number | null; monto: number | null };
    proyectos: number | null;
    clientes: number | null;
    disenos: number | null;
    costos: number | null;
    productos: number | null;
    herramientas: number | null;
    facturas: number | null;
  };
};

export type ObraResponse = {
  actividades: number;
  minutos: number;
  ligadas: number;
  disenos: number | null;
  desde: string;
  porTipo: Array<{ tipo: string; veces: number; realMin: number; calculadoMin: number | null }>;
  porSitio: Array<{ sitio: string; actividades: number; minutos: number; sinProyecto: number[] }>;
};

export const fetchDireccionHoy = (token: string) => erpFetch<DireccionHoy>("me/direccion/hoy", token);

export const fetchArea = (token: string, encargado?: number | null) =>
  erpFetch<AreaResponse>(encargado ? `me/area?encargado=${encargado}` : "me/area", token);

export const fetchObra = (token: string) => erpFetch<ObraResponse>("me/obra", token);

export const ligarObra = (token: string, actividadIds: number[], projectId: number) =>
  erpFetch<{ ligadas: number; omitidas: number }>("me/obra/ligar", token, {
    method: "POST",
    body: JSON.stringify({ actividadIds, projectId }),
  });

/** «91 %», o una raya si no hay con qué medirlo. */
export const porcentaje = (v: number | null | undefined) => (v == null ? "—" : `${v} %`);

/** «7 h 53», «45 min»; una cifra de tabla, corta. */
export function horasCortas(min: number | null | undefined): string {
  if (min == null) return "—";
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** «$9.08 M», «$480 mil». */
export function montoCorto(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)} M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000)} mil`;
  return `$${Math.round(v)}`;
}

/** Un módulo sin un solo registro lo dice en lugar de enseñar un cero. */
export type CuadroModulo = { id: string; nombre: string; href: string; valor: string | null; nota: string; sinCaptura?: boolean };

export function cuadrosDeModulos(m: DireccionHoy["modulos"]): CuadroModulo[] {
  const cuadro = (id: string, nombre: string, href: string, n: number | null, nota: string, vacio: string): CuadroModulo =>
    n === 0 ? { id, nombre, href, valor: null, nota: vacio, sinCaptura: true } : { id, nombre, href, valor: n == null ? "—" : n.toLocaleString("es-MX"), nota };
  const cot = m.cotizaciones;
  return [
    cuadro("actividades", "Actividades", "/erp/pizarra?vista=revision", m.porValidar, "por validar", "nada por validar"),
    {
      id: "cotizaciones",
      nombre: "Cotizaciones",
      href: "/erp/cotizaciones",
      valor: montoCorto(cot.monto),
      nota: `${cot.borrador ?? "—"} en borrador, ${cot.enviadas ?? "—"} enviadas`,
    },
    cuadro("proyectos", "Proyectos", "/erp/proyectos", m.proyectos, "activos", "ninguno activo"),
    cuadro("clientes", "Clientes", "/erp/clientes", m.clientes, "en padrón", "padrón vacío"),
    cuadro("disenos", "Diseños de cámaras", "/erp/videovigilancia", m.disenos, "en el diseñador", "ninguno todavía"),
    cuadro("costos", "Costos", "/erp/costos", m.costos, "movimientos", "sin movimientos"),
    cuadro("almacen", "Almacén", "/erp/almacen", m.productos, "productos", "0 productos"),
    cuadro("herramientas", "Herramientas", "/erp/almacen/herramientas", m.herramientas, "registradas", "ninguna registrada"),
    cuadro("facturas", "Facturación", "/erp/invoicing", m.facturas, "facturas", "0 facturas"),
  ];
}
