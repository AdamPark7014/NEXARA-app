import { apiRequest } from "@/lib/api-base";

export type UrgenciaBandeja =
  | "ticket_hoy"
  | "comprobacion"
  | "viatico"
  | "vehiculo"
  | "multa"
  | "mantenimiento"
  | "sin_responsable";

export type FilaBandeja = {
  clave: string;
  urgencia: UrgenciaBandeja;
  titulo: string;
  resumen: string;
  accion: string;
  href: string;
  entidadId: number;
  venceHoy?: boolean;
  monto?: number | null;
  createdAt?: string | null;
  fotoUrl?: string;
  puedeRevisar?: boolean;
};

export type BandejaResponse = {
  hoy: string;
  items: FilaBandeja[];
  conteo: Record<string, number>;
  iaTicketsDisponible: boolean;
  avisoLimite?: string;
};

export type TicketViatico = {
  id: number;
  tipo: string;
  monto: number;
  estado: string;
  fotoUrl: string;
  estacionComercio?: string | null;
  fechaLimiteFacturacion?: string | null;
  venceHoy?: boolean;
  puedeFacturar?: boolean;
  viatico?: { id: number; motivo?: string | null; User?: { nombre?: string | null } | null };
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

async function getJson<T>(token: string, path: string): Promise<T> {
  const res = await apiRequest(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

/** Bandeja unificada de la gestora (y contadora). */
export function fetchBandeja(token: string) {
  return getJson<BandejaResponse>(token, "gestion-viaticos/bandeja");
}

export function fetchMisTickets(token: string) {
  return getJson<TicketViatico[]>(token, "gestion-viaticos/mis-tickets");
}

export function fetchPorFacturar(token: string) {
  return getJson<{ hoy: string; items: TicketViatico[]; puedeFacturarTickets: boolean }>(token, "gestion-viaticos/por-facturar");
}

export async function subirTicket(
  token: string,
  fields: {
    viaticoId: number;
    tipo?: string;
    monto: number;
    fechaHora?: string;
    estacionComercio?: string;
    rfcEmisor?: string;
    puedeFacturar?: boolean;
    fechaLimiteFacturacion?: string;
    actividadId?: number;
    notas?: string;
  },
  foto: File,
) {
  const form = new FormData();
  form.append("viaticoId", String(fields.viaticoId));
  form.append("monto", String(fields.monto));
  if (fields.tipo) form.append("tipo", fields.tipo);
  if (fields.fechaHora) form.append("fechaHora", fields.fechaHora);
  if (fields.estacionComercio) form.append("estacionComercio", fields.estacionComercio);
  if (fields.rfcEmisor) form.append("rfcEmisor", fields.rfcEmisor);
  if (fields.puedeFacturar != null) form.append("puedeFacturar", String(fields.puedeFacturar));
  if (fields.fechaLimiteFacturacion) form.append("fechaLimiteFacturacion", fields.fechaLimiteFacturacion);
  if (fields.actividadId) form.append("actividadId", String(fields.actividadId));
  if (fields.notas) form.append("notas", fields.notas);
  form.append("foto", foto);
  const res = await apiRequest("gestion-viaticos/tickets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function revisarTicket(
  token: string,
  id: number,
  body: { accion: "aprobar" | "rechazar"; motivo?: string },
) {
  const res = await apiRequest(`gestion-viaticos/tickets/${id}/revisar`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function facturarTicket(
  token: string,
  id: number,
  body: { accion: "facturado" | "no_facturable"; notas?: string },
  files?: { xml?: File; pdf?: File },
) {
  const form = new FormData();
  form.append("accion", body.accion);
  if (body.notas) form.append("notas", body.notas);
  if (files?.xml) form.append("facturaXml", files.xml);
  if (files?.pdf) form.append("facturaPdf", files.pdf);
  const res = await apiRequest(`gestion-viaticos/tickets/${id}/facturar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function leerTicketIa(token: string, foto: File) {
  const form = new FormData();
  form.append("foto", foto);
  const res = await apiRequest("gestion-viaticos/leer-ticket", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{
    disponible: boolean;
    mensaje: string | null;
    datos: Record<string, unknown> | null;
  }>;
}
