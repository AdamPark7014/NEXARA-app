/**
 * Cliente de `/api/cctv-disenos` (Diseñador de videovigilancia). La API decide quién entra
 * (`acceso-cctv.ts`) y cuida que dos encargados no se pisen: cada guardado manda la versión que
 * se abrió y un 409 avisa que alguien más guardó antes.
 */
import { buildApiUrl } from "@/lib/api-base";
import { withTenantHeaders } from "@/lib/tenant";
import type { FilaCatalogo } from "./catalogo";
import type { Disponibilidad, LineaEnviar, ModeloConsulta, ResumenCt } from "./existencias";
import type { ResumenDiseno } from "./editor";
import type { Grabacion } from "./infraestructura";
import type { FichaLeida } from "./ficha";
import type { EspecSitio } from "./generarSitio";
import type { Plano } from "./plano";

export type EstadoDiseno = "borrador" | "enviada" | "aprobada";

export const ETIQUETA_ESTADO_DISENO: Readonly<Record<EstadoDiseno, string>> = {
  borrador: "Borrador",
  enviada: "Enviada al cliente",
  aprobada: "Aprobada",
};

type PersonaCorta = { id: number; nombre: string };

export type DisenoFila = {
  id: number;
  nombre: string;
  clienteId: number | null;
  clienteNombre: string | null;
  cotizacionId: number | null;
  estado: EstadoDiseno;
  resumen: ResumenDiseno | null;
  version: number;
  creadoPor: PersonaCorta;
  actualizadoPor: PersonaCorta | null;
  createdAt: string;
  updatedAt: string;
};

export type Diseno = DisenoFila & { plano: Plano; grabacion: Grabacion | null };

/** Otra persona guardó mientras se editaba: hay que recargar. */
export class ConflictoDeVersion extends Error {
  constructor(
    mensaje: string,
    readonly versionActual: number | null,
  ) {
    super(mensaje);
    this.name = "ConflictoDeVersion";
  }
}

async function pedir<T>(ruta: string, token: string, init: RequestInit = {}): Promise<T> {
  const esFormulario = typeof FormData !== "undefined" && init.body instanceof FormData;
  const res = await fetch(buildApiUrl(ruta), {
    ...init,
    credentials: "include",
    headers: withTenantHeaders({
      Authorization: `Bearer ${token}`,
      ...(init.body && !esFormulario ? { "Content-Type": "application/json" } : {}),
    }),
  });
  const texto = await res.text();
  let cuerpo: unknown = null;
  if (texto) {
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      cuerpo = texto;
    }
  }
  if (!res.ok) {
    const obj = cuerpo && typeof cuerpo === "object" ? (cuerpo as Record<string, unknown>) : {};
    const msg = Array.isArray(obj.message)
      ? obj.message.filter((m): m is string => typeof m === "string").join(", ")
      : typeof obj.message === "string"
        ? obj.message
        : "";
    if (res.status === 409) {
      const v = typeof obj.versionActual === "number" ? obj.versionActual : typeof obj.version === "number" ? obj.version : null;
      throw new ConflictoDeVersion(msg || "Otra persona guardó este diseño mientras lo editabas. Recarga para ver su versión.", v);
    }
    if (res.status === 403) throw new Error(msg || "El diseñador de videovigilancia es para encargados de área y el arquitecto.");
    if (res.status === 404) throw new Error(msg || "Diseño no encontrado.");
    throw new Error(msg || `No se pudo completar (HTTP ${res.status}).`);
  }
  return cuerpo as T;
}

export async function consultarAcceso(token: string): Promise<boolean> {
  const r = await pedir<{ puede: boolean }>("cctv-disenos/acceso", token);
  return Boolean(r?.puede);
}

export async function listarDisenos(token: string): Promise<DisenoFila[]> {
  const r = await pedir<{ disenos: DisenoFila[] }>("cctv-disenos", token);
  return r?.disenos ?? [];
}

export function crearDiseno(
  token: string,
  datos: { nombre: string; clienteId?: number | null; cotizacionId?: number | null },
): Promise<Diseno> {
  return pedir<Diseno>("cctv-disenos", token, { method: "POST", body: JSON.stringify(datos) });
}

export function obtenerDiseno(token: string, id: number): Promise<Diseno> {
  return pedir<Diseno>(`cctv-disenos/${id}`, token);
}

export function guardarDiseno(
  token: string,
  id: number,
  cambios: {
    version: number;
    nombre?: string;
    clienteId?: number | null;
    cotizacionId?: number | null;
    estado?: EstadoDiseno;
    plano?: Plano;
    grabacion?: Grabacion | null;
    resumen?: ResumenDiseno | null;
  },
): Promise<Diseno> {
  return pedir<Diseno>(`cctv-disenos/${id}`, token, { method: "PATCH", body: JSON.stringify(cambios) });
}

export function archivarDiseno(token: string, id: number): Promise<unknown> {
  return pedir(`cctv-disenos/${id}/archivar`, token, { method: "POST" });
}

export function subirCroquis(token: string, id: number, archivo: Blob, nombre = "croquis.png"): Promise<{ url: string; anchoPx: number; altoPx: number }> {
  const cuerpo = new FormData();
  cuerpo.append("file", archivo, nombre);
  return pedir(`cctv-disenos/${id}/croquis`, token, { method: "POST", body: cuerpo });
}

/* ── Catálogo de equipos ── */

export type EquipoParaGuardar = Omit<FilaCatalogo, "id" | "productId" | "verificado"> & { productId?: number | null; verificado?: boolean };

/* ── Existencias y cotización ── */

export async function consultarDisponibilidad(token: string, modelos: readonly ModeloConsulta[]): Promise<Disponibilidad[]> {
  const r = await pedir<{ modelos: Disponibilidad[] }>("cctv-disenos/catalogo/disponibilidad", token, { method: "POST", body: JSON.stringify({ modelos }) });
  return r?.modelos ?? [];
}

export type ResultadoCt = ResumenCt & { descripcion: string | null; imagen: string | null; familia: string | null; tipo: string | null };

export async function buscarEnCt(token: string, q: string, subcategoria: string): Promise<ResultadoCt[]> {
  const parametros = new URLSearchParams();
  if (q) parametros.set("q", q);
  if (subcategoria) parametros.set("sub", subcategoria);
  const r = await pedir<{ resultados: ResultadoCt[] }>(`cctv-disenos/catalogo/buscar-ct?${parametros}`, token);
  return r?.resultados ?? [];
}

/** La ficha de un producto de CT, para revisarla antes de agregarla al catálogo. */
export function fichaDesdeCt(token: string, clave: string): Promise<FichaLeida & { ct: string; sinLectura: boolean }> {
  return pedir("cctv-disenos/catalogo/desde-ct", token, { method: "POST", body: JSON.stringify({ clave }) });
}

export function altaEnAlmacen(token: string, cuerpo: { marca: string; modelo: string; descripcion?: string; categoria?: string; equipoId?: number | null }): Promise<{ productId: number; sku: string; yaExistia: boolean }> {
  return pedir("cctv-disenos/catalogo/alta-almacen", token, { method: "POST", body: JSON.stringify(cuerpo) });
}

export type ResultadoCotizacion = { cotizacionId: number; quoteNumber: string; creada: boolean; partidas: number; conservadas: number; sinPrecio: number };

export function pasarACotizacion(token: string, disenoId: number, lineas: readonly LineaEnviar[], nueva: boolean): Promise<ResultadoCotizacion> {
  return pedir(`cctv-disenos/${disenoId}/cotizacion`, token, { method: "POST", body: JSON.stringify({ lineas, nueva }) });
}

export function adjuntarPlanoACotizacion(token: string, disenoId: number, png: Blob, nombre: string): Promise<{ ok: true }> {
  const forma = new FormData();
  forma.append("file", png, "plano.png");
  forma.append("nombre", nombre);
  return pedir(`cctv-disenos/${disenoId}/cotizacion/plano`, token, { method: "POST", body: forma });
}

export async function listarCatalogo(token: string): Promise<FilaCatalogo[]> {
  const r = await pedir<{ equipos: FilaCatalogo[] }>("cctv-disenos/catalogo", token);
  return r?.equipos ?? [];
}

export function agregarAlCatalogo(token: string, equipo: EquipoParaGuardar): Promise<FilaCatalogo> {
  return pedir<FilaCatalogo>("cctv-disenos/catalogo", token, { method: "POST", body: JSON.stringify(equipo) });
}

export function editarCatalogo(token: string, id: number, equipo: EquipoParaGuardar): Promise<FilaCatalogo> {
  return pedir<FilaCatalogo>(`cctv-disenos/catalogo/${id}`, token, { method: "PATCH", body: JSON.stringify(equipo) });
}

export function archivarDelCatalogo(token: string, id: number): Promise<unknown> {
  return pedir(`cctv-disenos/catalogo/${id}/archivar`, token, { method: "POST" });
}

/** La IA lee la memoria técnica. No guarda nada: lo que regresa se revisa antes de `agregarAlCatalogo`. */
export function leerFicha(token: string, archivo: File): Promise<FichaLeida> {
  const cuerpo = new FormData();
  cuerpo.append("file", archivo, archivo.name);
  return pedir<FichaLeida>("cctv-disenos/catalogo/leer-ficha", token, { method: "POST", body: cuerpo });
}

/** Sin su PDF: la IA pasa a datos lo que la persona dice del equipo, y se revisa igual que una ficha. */
export function describirEquipo(token: string, frase: string): Promise<FichaLeida> {
  return pedir<FichaLeida>("cctv-disenos/catalogo/describir", token, { method: "POST", body: JSON.stringify({ frase }) });
}

/** La IA pasa la frase a datos del sitio. Con ellos arma el diseño `generarSitio`, aquí en el navegador. */
export function leerFraseDeSitio(token: string, frase: string): Promise<EspecSitio> {
  return pedir<EspecSitio>("cctv-disenos/generar-sitio", token, { method: "POST", body: JSON.stringify({ frase }) });
}
