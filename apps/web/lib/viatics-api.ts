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

/**
 * Lo que devuelven las mutaciones: el viático guardado, con los campos que las
 * pantallas leen de vuelta. El resto viaja sin tipar porque el payload de
 * Prisma cambia según el `include` de cada endpoint.
 */
export type ViaticoRespuesta =
  | ({ id: number; motivo?: string; ticketEvidenciaUrl?: string } & Record<string, unknown>)
  | null;

/** Una parte del reparto: qué actividad carga cuánto. */
export type ViaticoParte = {
  actividadId: number;
  monto: number;
  nota?: string | null;
};

/** Estado del anticipo tal como lo devuelve la API. */
export type ViaticoLiquidacion = {
  entregado: number;
  comprobado: number | null;
  saldo: number | null;
  estado: "SIN_COMPROBAR" | "CUADRADO" | "POR_DEVOLVER" | "POR_REEMBOLSAR";
};

export type ViaticoCreateFields = {
  usuarioId?: number;
  actividadId?: number | null;
  projectId?: number | null;
  vehicleId?: number | null;
  categoria?: string;
  motivo: string;
  montoSolicitado: number;
  comprobanteUrl?: string;
  /**
   * Reparto entre varias actividades. Solo viaja por JSON: con ticket adjunto
   * el alta va en `FormData`, donde una lista anidada no sobrevive, así que en
   * ese caso se guarda después con `setViaticoReparto`.
   */
  partes?: ViaticoParte[];
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
      partes: fields.partes,
    });
  }
  const res = await fetch(buildApiUrl("viatics"), { method: "POST", headers, body });
  if (!res.ok) throw new Error(await parseError(res));
  const created = await res.text();
  const viatico = created ? JSON.parse(created) : null;
  // Con ticket adjunto el alta viaja en `FormData` y el reparto no cabe ahí:
  // se guarda en una segunda llamada, ya con el id del viático.
  if (viatico?.id && file && fields.partes?.length) {
    await setViaticoReparto(token, viatico.id, fields.partes);
  }
  return viatico;
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
      partes: fields.partes,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

/**
 * Sustituye el reparto de un viático. Lista vacía = deshacerlo.
 *
 * La suma de las partes tiene que ser el total exacto; si no, la API contesta
 * cuánto falta o sobra y ese texto se enseña junto al campo.
 */
export async function setViaticoReparto(token: string, id: number, partes: ViaticoParte[]) {
  const res = await fetch(buildApiUrl(`viatics/${id}/reparto`), {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ partes }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

/** Cierra el anticipo: cuánto se comprobó con tickets y qué saldo queda. */
export async function comprobarViatico(
  token: string,
  id: number,
  fields: { montoComprobado: number; nota?: string; comprobanteUrl?: string },
  file?: File | null,
) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: BodyInit;
  if (file) {
    const form = new FormData();
    form.append("montoComprobado", String(fields.montoComprobado));
    if (fields.nota) form.append("nota", fields.nota);
    form.append("ticketEvidencia", file);
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({
      montoComprobado: fields.montoComprobado,
      nota: fields.nota,
      ticketEvidenciaUrl: fields.comprobanteUrl,
    });
  }
  const res = await fetch(buildApiUrl(`viatics/${id}/comprobar`), {
    method: "PATCH",
    headers,
    body,
  });
  if (!res.ok) throw new Error(await parseError(res));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

/**
 * Edita un viático.
 *
 * Con archivo adjunto el PATCH viaja en `FormData`, donde el reparto no cabe.
 * Si además cambia el monto, mandar solo el archivo dejaría el reparto viejo
 * descuadrado y la API lo rechazaría sin salida: por eso los datos van primero
 * en JSON —con su reparto— y el archivo después, en su propia llamada.
 */
export async function patchViatico(
  token: string,
  id: number,
  fields: Partial<ViaticoCreateFields>,
  file?: File | null,
): Promise<ViaticoRespuesta> {
  if (file && fields.partes !== undefined) {
    const conDatos = await patchViatico(token, id, { ...fields, partes: fields.partes });
    await patchViatico(token, id, {}, file);
    return conDatos;
  }
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
      partes: fields.partes,
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
  /** Recorte: se autoriza menos de lo pedido. Vacío = se autoriza el total. */
  montoAprobado?: number,
) {
  const res = await fetch(buildApiUrl(`viatics/${id}/approve`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, note, montoAprobado }),
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
