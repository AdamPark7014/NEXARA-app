import { buildApiUrl } from "@/lib/api-base";
import { triggerBlobDownload } from "@/lib/file-download";

export const VIATIC_CATEGORIES = [
  "COMBUSTIBLE",
  "CASETA",
  "HOSPEDAJE",
  "ALIMENTACION",
  "TRANSPORTE",
  "OTROS",
] as const;

export type ViaticCategory = (typeof VIATIC_CATEGORIES)[number];

export type ViaticoCreateFields = {
  usuarioId?: number;
  actividadId?: number | null;
  projectId?: number | null;
  vehicleId?: number | null;
  categoria?: string;
  motivo: string;
  montoSolicitado: number;
  comprobanteUrl?: string;
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

function appendCreateFields(form: FormData, fields: ViaticoCreateFields) {
  if (fields.usuarioId) form.append("usuarioId", String(fields.usuarioId));
  if (fields.actividadId) form.append("actividadId", String(fields.actividadId));
  if (fields.projectId) form.append("projectId", String(fields.projectId));
  if (fields.vehicleId) form.append("vehicleId", String(fields.vehicleId));
  if (fields.categoria) form.append("categoria", fields.categoria);
  form.append("motivo", fields.motivo);
  form.append("montoSolicitado", String(fields.montoSolicitado));
  if (fields.comprobanteUrl) form.append("comprobante", fields.comprobanteUrl);
}

export async function postViatico(
  token: string,
  fields: ViaticoCreateFields,
  file?: File | null,
) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: BodyInit;
  if (file) {
    const form = new FormData();
    appendCreateFields(form, fields);
    form.append("ticketEvidencia", file);
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({
      usuarioId: fields.usuarioId,
      actividadId: fields.actividadId,
      projectId: fields.projectId,
      vehicleId: fields.vehicleId,
      categoria: fields.categoria,
      motivo: fields.motivo,
      montoSolicitado: fields.montoSolicitado,
      ticketEvidenciaUrl: fields.comprobanteUrl,
    });
  }
  const res = await fetch(buildApiUrl("viatics"), { method: "POST", headers, body });
  if (!res.ok) throw new Error(await parseError(res));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

/** Asigna viático a un usuario para actividad/proyecto (sin evidencia). */
export async function assignViatico(token: string, fields: ViaticoCreateFields) {
  if (!fields.usuarioId) {
    throw new Error("Debes indicar el usuario beneficiario");
  }
  const res = await fetch(buildApiUrl("viatics/assign"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      usuarioId: fields.usuarioId,
      actividadId: fields.actividadId,
      projectId: fields.projectId,
      vehicleId: fields.vehicleId,
      categoria: fields.categoria,
      motivo: fields.motivo,
      montoSolicitado: fields.montoSolicitado,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export async function patchViatico(
  token: string,
  id: number,
  fields: Partial<ViaticoCreateFields>,
  file?: File | null,
) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: BodyInit;
  if (file) {
    const form = new FormData();
    if (fields.motivo !== undefined) form.append("motivo", fields.motivo);
    if (fields.montoSolicitado !== undefined) {
      form.append("montoSolicitado", String(fields.montoSolicitado));
    }
    if (fields.comprobanteUrl) form.append("comprobante", fields.comprobanteUrl);
    if (fields.categoria) form.append("categoria", fields.categoria);
    if (fields.actividadId != null) form.append("actividadId", String(fields.actividadId));
    if (fields.projectId != null) form.append("projectId", String(fields.projectId));
    if (fields.vehicleId != null) form.append("vehicleId", String(fields.vehicleId));
    form.append("ticketEvidencia", file);
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({
      motivo: fields.motivo,
      montoSolicitado: fields.montoSolicitado,
      ticketEvidenciaUrl: fields.comprobanteUrl,
      categoria: fields.categoria,
      actividadId: fields.actividadId,
      projectId: fields.projectId,
      vehicleId: fields.vehicleId,
    });
  }
  const res = await fetch(buildApiUrl(`viatics/${id}`), { method: "PATCH", headers, body });
  if (!res.ok) throw new Error(await parseError(res));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export async function approveViatico(
  token: string,
  id: number,
  action: "approve" | "reject",
  note?: string,
) {
  const res = await fetch(buildApiUrl(`viatics/${id}/approve`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, note }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export async function markViaticoPagado(token: string, id: number) {
  const res = await fetch(buildApiUrl(`viatics/${id}/pagado`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export type ViaticsAnalytics = {
  from: string | null;
  to: string | null;
  totals: {
    count: number;
    pendientes: number;
    totalSolicitado: number;
    totalAprobado: number;
    totalPagado: number;
  };
  byProject: { name: string; total: number; count: number }[];
  byPerson: { name: string; total: number; count: number }[];
  byCategory: { name: string; total: number; count: number }[];
};

export async function fetchViaticsAnalytics(
  token: string,
  filters: { from?: string; to?: string; projectId?: number } = {},
): Promise<ViaticsAnalytics> {
  const qs = new URLSearchParams();
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  if (filters.projectId) qs.set("projectId", String(filters.projectId));
  const res = await fetch(buildApiUrl(`viatics/analytics?${qs}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function downloadViaticsReportPdf(
  token: string,
  filters: { from?: string; to?: string; projectId?: number } = {},
) {
  const qs = new URLSearchParams();
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  if (filters.projectId) qs.set("projectId", String(filters.projectId));
  const res = await fetch(buildApiUrl(`viatics/report.pdf?${qs}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  await triggerBlobDownload(blob, `viaticos-${filters.from || "inicio"}-${filters.to || "hoy"}.pdf`, {
    mimeType: "application/pdf",
  });
}
