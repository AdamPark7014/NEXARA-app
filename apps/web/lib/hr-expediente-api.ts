import { withTenantHeaders } from "@/lib/tenant";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: withTenantHeaders({
      Authorization: `Bearer ${token}`,
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers as Record<string, string> ?? {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(formatApiError(text || res.statusText, "No se pudo completar la operación de RH."));
  }
  if (res.status === 204) return null;
  return res.json();
}

export function obtenerExpediente(token: string, userId: number) {
  return apiFetch(`hr/expediente/${userId}`, token);
}

export function obtenerAlertasRh(token: string) {
  return apiFetch("hr/expediente/alertas", token);
}

export function previewImportPersonal(token: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetch("hr/personal-import/preview", token, { method: "POST", body: fd });
}

export function confirmarImportPersonal(token: string, body: unknown) {
  return apiFetch("hr/personal-import/confirmar", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function solicitarCambioRh(token: string, body: unknown) {
  return apiFetch("hr/expediente/cambios", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function decidirSolicitudRh(token: string, id: number, aprobar: boolean, motivo?: string) {
  return apiFetch(`hr/expediente/solicitudes/${id}/decidir`, token, {
    method: "POST",
    body: JSON.stringify({ aprobar, motivo }),
  });
}

export function listarMisSolicitudesRh(token: string) {
  return apiFetch("hr/solicitudes-aprobacion/mis-pendientes", token);
}
