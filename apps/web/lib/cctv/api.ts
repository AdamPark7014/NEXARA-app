/**
 * Cliente de `/api/cctv-disenos` (Diseñador de videovigilancia). La API decide quién entra
 * (`acceso-cctv.ts`) y cuida que dos encargados no se pisen: cada guardado manda la versión que
 * se abrió y un 409 avisa que alguien más guardó antes.
 */
import { buildApiUrl } from "@/lib/api-base";
import { withTenantHeaders } from "@/lib/tenant";
import type { ResumenDiseno } from "./editor";
import type { Grabacion } from "./infraestructura";
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
