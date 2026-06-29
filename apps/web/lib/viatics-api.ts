import { buildApiUrl } from "@/lib/api-base";

export async function postViatico(
  token: string,
  fields: {
    usuarioId?: number;
    actividadId?: number;
    motivo: string;
    montoSolicitado: number;
    comprobanteUrl?: string;
  },
  file?: File | null,
) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: BodyInit;
  if (file) {
    const form = new FormData();
    if (fields.usuarioId) form.append("usuarioId", String(fields.usuarioId));
    if (fields.actividadId) form.append("actividadId", String(fields.actividadId));
    form.append("motivo", fields.motivo);
    form.append("montoSolicitado", String(fields.montoSolicitado));
    if (fields.comprobanteUrl) form.append("comprobante", fields.comprobanteUrl);
    form.append("ticketEvidencia", file);
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({
      usuarioId: fields.usuarioId,
      actividadId: fields.actividadId,
      motivo: fields.motivo,
      montoSolicitado: fields.montoSolicitado,
      ticketEvidenciaUrl: fields.comprobanteUrl,
    });
  }
  const res = await fetch(buildApiUrl("viatics"), { method: "POST", headers, body });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export async function patchViatico(
  token: string,
  id: number,
  fields: { motivo?: string; montoSolicitado?: number; comprobanteUrl?: string },
  file?: File | null,
) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: BodyInit;
  if (file) {
    const form = new FormData();
    if (fields.motivo !== undefined) form.append("motivo", fields.motivo);
    if (fields.montoSolicitado !== undefined) form.append("montoSolicitado", String(fields.montoSolicitado));
    if (fields.comprobanteUrl) form.append("comprobante", fields.comprobanteUrl);
    form.append("ticketEvidencia", file);
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({
      motivo: fields.motivo,
      montoSolicitado: fields.montoSolicitado,
      ticketEvidenciaUrl: fields.comprobanteUrl,
    });
  }
  const res = await fetch(buildApiUrl(`viatics/${id}`), { method: "PATCH", headers, body });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
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
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export async function markViaticoPagado(token: string, id: number) {
  const res = await fetch(buildApiUrl(`viatics/${id}`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ estatus: "Pagado" }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
