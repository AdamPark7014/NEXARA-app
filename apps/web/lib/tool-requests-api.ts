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
};

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
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export function normalizeToolRequestRow(raw: Record<string, unknown>): ToolRequestRow {
  const requestedBy = (raw.requestedBy as Record<string, unknown>) ?? {};
  const approvedBy = (raw.approvedBy as Record<string, unknown>) ?? null;
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

export async function deliverToolRequest(token: string, id: number) {
  return apiJson(token, `tool-requests/${id}/deliver`, { method: "POST" });
}

export async function returnToolRequest(token: string, id: number, damageDescription?: string) {
  return apiJson(token, `tool-requests/${id}/return`, {
    method: "POST",
    body: JSON.stringify({ damageDescription: damageDescription?.trim() || undefined }),
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
