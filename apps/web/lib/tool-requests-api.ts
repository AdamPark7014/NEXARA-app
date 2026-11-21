import { buildApiUrl } from "@/lib/api-base";

export type ToolRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "IN_USE"
  | "RETURNED"
  | "DAMAGED"
  | "REJECTED";

export type ToolRequestRow = {
  id: number;
  toolName: string;
  model: string;
  serialNumber: string;
  reason: string;
  status: ToolRequestStatus;
  requestDate: string;
  expectedReturnDate: string | null;
  approvalDate: string | null;
  deliveryDate: string | null;
  pickedUpAt: string | null;
  returnDate: string | null;
  requestedByName: string;
  requestedByEmail: string;
  approvedByName: string | null;
  renewalCount: number;
  /** Código que el almacén pide al entregar. Solo llega en los préstamos propios o a quien gestiona. */
  pickupCode: string | null;
  pickupExpiresAt: string | null;
  /** Actividad para la que se pidió («AN-123 · Título»), si la hay. */
  activityLabel: string | null;
  adminNotes: string | null;
  damageDescription: string | null;
  /** Evidencia: cómo salió («antes») y cómo volvió («después»). */
  deliveryPhotos: string[];
  returnPhotos: string[];
  returnCondition: CondicionDevolucion | null;
  returnNotes: string | null;
  deliveredByName: string | null;
  receivedByName: string | null;
  pickedUpByName: string | null;
};

/** En qué estado vuelve una herramienta. Espejo de `apps/api/src/tool-requests/evidencia-prestamo.ts`. */
export const CONDICIONES_DEVOLUCION = ["BIEN", "DESGASTE", "DANADA", "INCOMPLETA", "EXTRAVIADA"] as const;
export type CondicionDevolucion = (typeof CONDICIONES_DEVOLUCION)[number];

export const CONDICION_DEVOLUCION: Record<
  CondicionDevolucion,
  { etiqueta: string; ayuda: string; tono: "success" | "neutral" | "warning" | "danger" }
> = {
  BIEN: { etiqueta: "En buen estado", ayuda: "Vuelve al almacén lista para prestarse.", tono: "success" },
  DESGASTE: { etiqueta: "Con desgaste normal", ayuda: "Sirve y vuelve al almacén; queda anotado el desgaste.", tono: "neutral" },
  DANADA: { etiqueta: "Dañada", ayuda: "Pasa a reparación y no se presta hasta revisarla.", tono: "danger" },
  INCOMPLETA: { etiqueta: "Incompleta", ayuda: "Le falta una pieza o accesorio; pasa a revisión.", tono: "warning" },
  EXTRAVIADA: { etiqueta: "Extraviada", ayuda: "No volvió. Se da de baja del inventario.", tono: "danger" },
};

/** Fotos que acepta el servidor por entrega o devolución. */
export const MAX_FOTOS_EVIDENCIA = 6;

/** ¿La condición exige explicar qué pasó? ¿Exige foto? Mismas reglas que el servidor. */
export function condicionPideExplicacion(c: CondicionDevolucion): boolean {
  return c !== "BIEN" && c !== "DESGASTE";
}
export function condicionPideFoto(c: CondicionDevolucion): boolean {
  return c !== "EXTRAVIADA";
}

function fotosDe(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((f) => (typeof f === "string" ? f : String((f as { url?: unknown })?.url ?? "")))
    .filter(Boolean);
}

function nombreDe(valor: unknown): string | null {
  const nombre = (valor as { nombre?: unknown } | null)?.nombre;
  return nombre ? String(nombre) : null;
}

export type ToolRenewalRow = {
  id: number;
  toolRequestId: number;
  toolName: string;
  userName: string;
  userEmail: string;
  previousReturnDate: string;
  newReturnDate: string;
  renewalReason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requestDate: string;
  daysOverdue: number;
  approverName: string | null;
};

async function parseError(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return `HTTP ${res.status}`;
  try {
    const json = JSON.parse(text);
    return Array.isArray(json?.message) ? json.message.join(", ") : json?.message || text;
  } catch {
    return text;
  }
}

async function apiJson(token: string, path: string, init?: RequestInit) {
  // Con FormData el navegador pone el Content-Type con su boundary: no se le impone el de JSON.
  const esFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(esFormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export function normalizeToolRequestRow(raw: Record<string, unknown>): ToolRequestRow {
  // El servidor manda `usuario` y `approver` (`approvedBy` es solo el id). Antes se leía
  // `requestedBy`/`approvedBy` y toda la tabla salía con «N/A» y sin quién aprobó.
  const requestedBy = ((raw.usuario ?? raw.requestedBy) as Record<string, unknown>) ?? {};
  const aprobador = raw.approver ?? (typeof raw.approvedBy === "object" ? raw.approvedBy : null);
  const approvedBy = (aprobador as Record<string, unknown>) ?? null;
  const actividad = raw.activity as { anNumber?: unknown; titulo?: unknown } | null | undefined;
  const condicion = String(raw.returnCondition ?? "");
  return {
    id: Number(raw.id),
    toolName: String(raw.toolName ?? ""),
    model: String(raw.model ?? ""),
    serialNumber: String(raw.serialNumber ?? ""),
    reason: String(raw.reason ?? ""),
    status: String(raw.status ?? "PENDING") as ToolRequestStatus,
    requestDate: String(raw.requestDate ?? ""),
    expectedReturnDate: raw.expectedReturnDate ? String(raw.expectedReturnDate) : null,
    approvalDate: raw.approvalDate ? String(raw.approvalDate) : null,
    deliveryDate: raw.deliveryDate ? String(raw.deliveryDate) : null,
    pickedUpAt: raw.pickedUpAt ? String(raw.pickedUpAt) : null,
    returnDate: raw.returnDate ? String(raw.returnDate) : null,
    requestedByName: String(requestedBy.nombre ?? "N/A"),
    requestedByEmail: String(requestedBy.email ?? ""),
    approvedByName: approvedBy ? String(approvedBy.nombre ?? "") : null,
    renewalCount: Number(raw.renewalCount ?? 0),
    pickupCode: raw.pickupCode ? String(raw.pickupCode) : null,
    pickupExpiresAt: raw.pickupExpiresAt ? String(raw.pickupExpiresAt) : null,
    activityLabel: actividad
      ? [actividad.anNumber, actividad.titulo].map((v) => String(v ?? "").trim()).filter(Boolean).join(" · ") || null
      : null,
    adminNotes: raw.adminNotes ? String(raw.adminNotes) : null,
    damageDescription: raw.damageDescription ? String(raw.damageDescription) : null,
    deliveryPhotos: fotosDe(raw.deliveryPhotos),
    returnPhotos: fotosDe(raw.returnPhotos),
    returnCondition: (CONDICIONES_DEVOLUCION as readonly string[]).includes(condicion)
      ? (condicion as CondicionDevolucion)
      : null,
    returnNotes: raw.returnNotes ? String(raw.returnNotes) : null,
    deliveredByName: nombreDe(raw.deliveredBy),
    receivedByName: nombreDe(raw.receivedBy),
    pickedUpByName: nombreDe(raw.pickedUpBy),
  };
}

export function toolRequestStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: "Pendiente",
    APPROVED: "Aprobada",
    IN_USE: "En uso",
    RETURNED: "Devuelta",
    DAMAGED: "Dañada",
    REJECTED: "Rechazada",
  };
  return labels[status] ?? status;
}

export function toolRequestStatusVariant(
  status: string,
): "default" | "accent" | "positive" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "PENDING":
      return "warning";
    case "APPROVED":
      return "accent";
    case "IN_USE":
      return "positive";
    case "RETURNED":
      return "neutral";
    case "DAMAGED":
    case "REJECTED":
      return "danger";
    default:
      return "default";
  }
}

export async function listToolRequests(token: string, status?: string) {
  const path = status ? `tool-requests?status=${encodeURIComponent(status)}` : "tool-requests";
  const data = await apiJson(token, path);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((r) => normalizeToolRequestRow(r as Record<string, unknown>));
}

export async function approveToolRequest(token: string, id: number) {
  return apiJson(token, `tool-requests/${id}/approve`, { method: "POST" });
}

export async function rejectToolRequest(token: string, id: number, adminNotes: string) {
  return apiJson(token, `tool-requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ adminNotes }),
  });
}

/**
 * Entregar exige el código de recolección que trae quien recoge (el servidor lo valida).
 * Con `fotos` viaja como formulario: son las fotos de cómo sale la herramienta («antes»).
 */
export async function deliverToolRequest(
  token: string,
  id: number,
  pickupCode: string,
  opciones?: { fotos?: File[]; recogidaPorId?: number },
) {
  const fotos = opciones?.fotos ?? [];
  if (fotos.length > 0) {
    const form = new FormData();
    if (pickupCode.trim()) form.append("pickupCode", pickupCode.trim());
    if (opciones?.recogidaPorId) form.append("recogidaPorId", String(opciones.recogidaPorId));
    for (const foto of fotos.slice(0, MAX_FOTOS_EVIDENCIA)) form.append("fotos", foto);
    return apiJson(token, `tool-requests/${id}/deliver`, { method: "POST", body: form });
  }
  return apiJson(token, `tool-requests/${id}/deliver`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pickupCode: pickupCode.trim(),
      ...(opciones?.recogidaPorId ? { recogidaPorId: opciones.recogidaPorId } : {}),
    }),
  });
}

/**
 * Recibir la herramienta de vuelta: en qué estado llega, qué le pasó y las fotos de «después».
 * La forma corta (solo texto de daño) se conserva para quien todavía la llama.
 */
export async function returnToolRequest(
  token: string,
  id: number,
  devolucion?: string | { condicion: CondicionDevolucion; descripcion?: string; fotos?: File[] },
) {
  if (typeof devolucion === "object" && devolucion) {
    const form = new FormData();
    form.append("condicion", devolucion.condicion);
    if (devolucion.descripcion?.trim()) form.append("damageDescription", devolucion.descripcion.trim());
    for (const foto of (devolucion.fotos ?? []).slice(0, MAX_FOTOS_EVIDENCIA)) form.append("fotos", foto);
    return apiJson(token, `tool-requests/${id}/return`, { method: "POST", body: form });
  }
  return apiJson(token, `tool-requests/${id}/return`, {
    method: "POST",
    body: JSON.stringify({ damageDescription: devolucion?.trim() || undefined }),
  });
}

/** Mis préstamos, del más reciente al más viejo (`tools.view`). */
export async function listMyToolRequests(token: string) {
  const data = await apiJson(token, "tool-requests/my-requests");
  const rows = Array.isArray(data) ? data : [];
  return rows.map((r) => normalizeToolRequestRow(r as Record<string, unknown>));
}

/** Pedir más plazo sobre un préstamo propio que está en uso. */
export async function requestToolRenewal(token: string, id: number, newReturnDate: string, renewalReason?: string) {
  return apiJson(token, `tool-requests/${id}/renewal-request`, {
    method: "POST",
    body: JSON.stringify({ newReturnDate, renewalReason: renewalReason?.trim() || undefined }),
  });
}

export function normalizeToolRenewalRow(raw: Record<string, unknown>): ToolRenewalRow {
  const toolRequest = (raw.toolRequest as Record<string, unknown>) ?? {};
  const usuario = (toolRequest.usuario as Record<string, unknown>) ?? {};
  const approver = (raw.approver as Record<string, unknown>) ?? null;
  const prev = new Date(String(raw.previousReturnDate ?? ""));
  const now = Date.now();
  const daysOverdue = Math.max(0, Math.floor((now - prev.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    id: Number(raw.id),
    toolRequestId: Number(raw.toolRequestId ?? toolRequest.id ?? 0),
    toolName: String(toolRequest.toolName ?? ""),
    userName: String(usuario.nombre ?? "N/A"),
    userEmail: String(usuario.email ?? ""),
    previousReturnDate: String(raw.previousReturnDate ?? ""),
    newReturnDate: String(raw.newReturnDate ?? ""),
    renewalReason: raw.renewalReason ? String(raw.renewalReason) : null,
    status: String(raw.status ?? "PENDING") as ToolRenewalRow["status"],
    requestDate: String(raw.requestDate ?? ""),
    daysOverdue,
    approverName: approver ? String(approver.nombre ?? "") : null,
  };
}

export async function listPendingToolRenewals(token: string) {
  const data = await apiJson(token, "tool-requests/renewals/pending");
  const rows = Array.isArray(data) ? data : [];
  return rows.map((r) => normalizeToolRenewalRow(r as Record<string, unknown>));
}

export async function approveToolRenewal(token: string, id: number) {
  return apiJson(token, `tool-requests/renewals/${id}/approve`, { method: "POST" });
}

export async function rejectToolRenewal(token: string, id: number, reason: string) {
  return apiJson(token, `tool-requests/renewals/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// ── Kits e inventario: helpers para el selector de herramientas ────────────────

export type InventoryToolOption = {
  id: number;
  toolName: string;
  model: string;
  serialNumber: string;
  status: "AVAILABLE" | "ASSIGNED" | "IN_REPAIR" | "RETIRED" | string;
  panoramicPhotoUrl?: string;
  serialPhotoUrl?: string;
};

export type KitAssignmentRow = {
  id: number;
  user: { id: number; nombre: string; email?: string | null };
  inventoryItem: InventoryToolOption;
  assignedAt: string;
  isActive: boolean;
};

export async function searchInventoryTools(token: string, query: string) {
  const q = String(query || "").trim();
  if (!q) return [] as InventoryToolOption[];
  const data = await apiJson(token, `tool-requests/inventory/search?q=${encodeURIComponent(q)}`);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((r) => ({
    id: Number(r.id),
    toolName: String(r.toolName ?? ""),
    model: String(r.model ?? ""),
    serialNumber: String(r.serialNumber ?? ""),
    status: String(r.status ?? ""),
    panoramicPhotoUrl: r.panoramicPhotoUrl ? String(r.panoramicPhotoUrl) : undefined,
    serialPhotoUrl: r.serialPhotoUrl ? String(r.serialPhotoUrl) : undefined,
  })) as InventoryToolOption[];
}

export async function getUsersKit(token: string, userId: number) {
  const data = await apiJson(token, `tool-requests/kits/users?userId=${encodeURIComponent(String(userId))}`);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((r) => ({
    id: Number(r.id),
    user: {
      id: Number(r.user?.id ?? 0),
      nombre: String(r.user?.nombre ?? ""),
      email: r.user?.email ? String(r.user.email) : null,
    },
    inventoryItem: {
      id: Number(r.inventoryItem?.id ?? 0),
      toolName: String(r.inventoryItem?.toolName ?? ""),
      model: String(r.inventoryItem?.model ?? ""),
      serialNumber: String(r.inventoryItem?.serialNumber ?? ""),
      status: String(r.inventoryItem?.status ?? ""),
      panoramicPhotoUrl: r.inventoryItem?.panoramicPhotoUrl ? String(r.inventoryItem.panoramicPhotoUrl) : undefined,
      serialPhotoUrl: r.inventoryItem?.serialPhotoUrl ? String(r.inventoryItem.serialPhotoUrl) : undefined,
    },
    assignedAt: String(r.assignedAt ?? ""),
    isActive: Boolean(r.isActive),
  })) as KitAssignmentRow[];
}
