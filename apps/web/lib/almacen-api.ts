/**
 * Cliente del frente de almacén: reabastecimiento, norma de empaque, recolección de
 * herramienta y revisión de kits.
 *
 * Vive aparte de `stock-api.ts` y `tool-requests-api.ts` (que siguen sirviendo lo de
 * siempre) para no tocar lo que ya funciona mientras este frente se construye.
 */
import { buildApiUrl } from "@/lib/api-base";

async function mensajeDeError(res: Response, fallback: string) {
  const texto = await res.text().catch(() => "");
  if (!texto) return `${fallback} (HTTP ${res.status})`;
  try {
    const json = JSON.parse(texto);
    if (Array.isArray(json?.message)) return json.message.join(", ");
    if (typeof json?.message === "string") return json.message;
  } catch {
    /* el cuerpo no era JSON: se usa tal cual abajo */
  }
  return texto.slice(0, 240) || fallback;
}

async function pedir<T>(
  path: string,
  token: string,
  init: RequestInit = {},
  fallback = "No se pudo completar la operación",
): Promise<T> {
  // Con FormData manda el navegador: si le imponemos el Content-Type se queda sin el
  // boundary y el servidor no encuentra ni los campos ni los archivos.
  const esFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(esFormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error(await mensajeDeError(res, fallback));
  if (res.status === 204) return null as T;
  const texto = await res.text();
  return (texto ? JSON.parse(texto) : null) as T;
}

// ── Reabastecimiento ────────────────────────────────────────────────

export type RenglonReabastecimiento = {
  stockLevelId: number;
  productId: number;
  sku: string;
  producto: string;
  unidadBase: string;
  warehouseId: number;
  almacen: string;
  onHand: number;
  reservado: number;
  disponible: number;
  min: number;
  max: number;
  calculadoAt: string | null;
  consumoDiario: number;
  diasDeCobertura: number | null;
  reponer: boolean;
  sugerido: number;
  sugeridoEmpaque: { nombre: string; unidades: number; piezasPorUnidad: number } | null;
  leadTimeDias: number;
  compraMinima: number | null;
  historiaCorta: boolean;
};

export function listarReabastecimiento(
  token: string,
  filtros?: { warehouseId?: number; todos?: boolean },
) {
  const qs = new URLSearchParams();
  if (filtros?.warehouseId) qs.set("warehouseId", String(filtros.warehouseId));
  if (filtros?.todos) qs.set("todos", "true");
  const s = qs.toString();
  return pedir<RenglonReabastecimiento[]>(
    `stock/reabastecimiento${s ? `?${s}` : ""}`,
    token,
    {},
    "No se pudo cargar el reabastecimiento",
  );
}

export function recalcularReabastecimiento(
  token: string,
  payload?: { warehouseId?: number; productId?: number },
) {
  return pedir<{ recalculados: number; conMinimo: number; calculadoAt: string }>(
    "stock/reabastecimiento/recalcular",
    token,
    { method: "POST", body: JSON.stringify(payload ?? {}) },
    "No se pudo recalcular",
  );
}

// ── Norma de empaque ────────────────────────────────────────────────

export type Empaque = {
  id: number;
  productId: number;
  nombre: string;
  piezasPorUnidad: number | string;
  codigoBarras: string | null;
  esDefaultCompra: boolean;
};

export function listarEmpaques(token: string, productId: number) {
  return pedir<Empaque[]>(
    `stock/products/${productId}/empaques`,
    token,
    {},
    "No se pudieron cargar las presentaciones",
  );
}

export function crearEmpaque(
  token: string,
  productId: number,
  payload: {
    nombre: string;
    piezasPorUnidad: number;
    codigoBarras?: string;
    esDefaultCompra?: boolean;
  },
) {
  return pedir<Empaque>(
    `stock/products/${productId}/empaques`,
    token,
    { method: "POST", body: JSON.stringify(payload) },
    "No se pudo guardar la presentación",
  );
}

export function borrarEmpaque(token: string, packagingId: number) {
  return pedir<{ ok: true }>(
    `stock/empaques/${packagingId}`,
    token,
    { method: "DELETE" },
    "No se pudo borrar la presentación",
  );
}

// ── Recolección de herramienta ──────────────────────────────────────

export type ActividadSolicitable = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  fechaMaxima: string | null;
  client: { id: number; name: string } | null;
};

export function listarMisActividadesParaHerramienta(token: string) {
  return pedir<ActividadSolicitable[]>(
    "tool-requests/mis-actividades",
    token,
    {},
    "No se pudieron cargar tus actividades",
  );
}

export type PendienteDeRecoleccion = {
  id: number;
  toolName: string;
  model: string;
  serialNumber: string;
  pickupCode: string | null;
  pickupExpiresAt: string | null;
  approvalDate: string | null;
  vencido: boolean;
  horasRestantes: number | null;
  usuario: { id: number; nombre: string; email: string } | null;
  activity: { id: number; anNumber: string; titulo: string } | null;
};

export function listarPendientesDeRecoleccion(token: string) {
  return pedir<PendienteDeRecoleccion[]>(
    "tool-requests/pickup/pendientes",
    token,
    {},
    "No se pudo cargar lo pendiente de entregar",
  );
}

export type BusquedaPickup = {
  solicitud: PendienteDeRecoleccion & {
    inventoryItem: { id: number; toolName: string; model: string; serialNumber: string } | null;
  };
  valido: boolean;
  motivo: string | null;
  mensaje: string | null;
  horasRestantes: number | null;
};

export function buscarPorCodigoDeRecoleccion(token: string, codigo: string) {
  return pedir<BusquedaPickup>(
    `tool-requests/pickup/${encodeURIComponent(codigo)}`,
    token,
    {},
    "No se encontró el código",
  );
}

export function entregarConCodigo(
  token: string,
  toolRequestId: number,
  payload: { pickupCode?: string; recogidaPorId?: number },
) {
  return pedir<unknown>(
    `tool-requests/${toolRequestId}/deliver`,
    token,
    { method: "POST", body: JSON.stringify(payload) },
    "No se pudo entregar la herramienta",
  );
}

// ── Revisión periódica de kits ──────────────────────────────────────

export type EstadoInspeccion = "OK" | "OBSERVADO" | "DANADO";

export type KitPorInspeccionar = {
  id: number;
  userId: number;
  inspeccionCadaDias: number | null;
  proximaInspeccion: string | null;
  vencida: boolean;
  diasDeAtraso: number;
  diasParaLaProxima: number | null;
  porVencer: boolean;
  inventoryItem: { id: number; toolName: string; model: string; serialNumber: string } | null;
  user: { id: number; nombre: string; email: string } | null;
  ultimaInspeccion: {
    id: number;
    fecha: string;
    estado: EstadoInspeccion;
    notas: string | null;
  } | null;
};

export function listarKitsPorInspeccionar(token: string, opciones?: { porVencer?: boolean }) {
  const qs = opciones?.porVencer ? "?porVencer=true" : "";
  return pedir<KitPorInspeccionar[]>(
    `tool-requests/kits/inspecciones/pendientes${qs}`,
    token,
    {},
    "No se pudieron cargar las revisiones de kit",
  );
}

export function programarInspeccionKit(
  token: string,
  assignmentId: number,
  inspeccionCadaDias: number | null,
) {
  return pedir<unknown>(
    `tool-requests/kits/${assignmentId}/inspeccion-programada`,
    token,
    { method: "PUT", body: JSON.stringify({ inspeccionCadaDias }) },
    "No se pudo programar la revisión",
  );
}

export type InspeccionKit = {
  id: number;
  fecha: string;
  estado: EstadoInspeccion;
  notas: string | null;
  fotos: Array<{ url: string; capturedAt?: string; lat?: number; lng?: number }> | null;
  inspector: { id: number; nombre: string } | null;
};

/**
 * Registra la revisión. Con archivos va como `multipart/form-data` (el navegador pone
 * su propio `Content-Type` con el boundary, por eso no se manda el de JSON).
 */
export function registrarInspeccionKit(
  token: string,
  assignmentId: number,
  payload: { estado: EstadoInspeccion; notas?: string; archivos?: File[] },
) {
  const path = `tool-requests/kits/${assignmentId}/inspeccion`;
  const fallback = "No se pudo registrar la revisión";

  if (payload.archivos?.length) {
    const form = new FormData();
    form.append("estado", payload.estado);
    if (payload.notas) form.append("notas", payload.notas);
    for (const archivo of payload.archivos) form.append("fotos", archivo);
    return pedir<InspeccionKit>(path, token, { method: "POST", body: form }, fallback);
  }

  return pedir<InspeccionKit>(
    path,
    token,
    { method: "POST", body: JSON.stringify({ estado: payload.estado, notas: payload.notas }) },
    fallback,
  );
}

export function listarInspeccionesKit(token: string, assignmentId: number) {
  return pedir<InspeccionKit[]>(
    `tool-requests/kits/${assignmentId}/inspecciones`,
    token,
    {},
    "No se pudo cargar el historial de revisiones",
  );
}
