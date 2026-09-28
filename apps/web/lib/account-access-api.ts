/**
 * «Acceso a cuentas» — solo el dueño (Christian). Consume `apps/api/src/account-access`.
 *
 * Vuelve a escribir su contraseña (`unlock`), recibe una ficha de 5 minutos (que vive solo en memoria de
 * la pantalla) y con ella lista las cuentas, ve la contraseña guardada de una cuenta (cifrada en la bóveda
 * del servidor) y restablece la de cualquiera (la nueva también queda guardada).
 */
import { buildApiUrl } from "@/lib/api-base";

export type CuentaEmpresa = {
  id: number;
  nombre: string;
  email: string;
  roleKey: string | null;
  isActive: boolean;
  passwordChangedAt: string | null;
  /** ¿Hay una contraseña guardada que se pueda mostrar? (la lista nunca trae la contraseña) */
  guardada: boolean;
  guardadaEl: string | null;
};

export type Desbloqueo = { ficha: string; venceEn: string };
export type ContrasenaNueva = { id: number; nombre: string; email: string; password: string };
export type EstadoCuentas = { puedeEntrar: boolean; bovedaLista: boolean };

async function pedir<T>(path: string, token: string, init: RequestInit = {}, ficha?: string): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(ficha ? { "x-access-token": ficha } : {}),
  };
  const res = await fetch(buildApiUrl(path), { ...init, headers, credentials: "include", cache: "no-store" });
  if (!res.ok) {
    let mensaje = "No se pudo completar la operación.";
    try {
      const cuerpo = (await res.json()) as { message?: string | string[] };
      const m = Array.isArray(cuerpo?.message) ? cuerpo.message.join(" ") : cuerpo?.message;
      if (m) mensaje = m;
    } catch {
      /* mensaje general */
    }
    throw Object.assign(new Error(mensaje), { status: res.status });
  }
  return (await res.json()) as T;
}

/** ¿Esta persona puede entrar y la bóveda tiene llave? Cualquier fallo = no (no se muestra el enlace). */
export async function estadoCuentas(token: string): Promise<EstadoCuentas> {
  try {
    const r = await pedir<{ puedeEntrar?: boolean; bovedaLista?: boolean }>("account-access/status", token);
    return { puedeEntrar: r?.puedeEntrar === true, bovedaLista: r?.bovedaLista === true };
  } catch {
    return { puedeEntrar: false, bovedaLista: false };
  }
}

export async function puedeEntrarACuentas(token: string): Promise<boolean> {
  return (await estadoCuentas(token)).puedeEntrar;
}

export const revelarContrasena = (token: string, ficha: string, userId: number) =>
  pedir<ContrasenaNueva>(`account-access/users/${userId}/reveal`, token, { method: "POST" }, ficha);

export const desbloquearCuentas = (token: string, password: string) =>
  pedir<Desbloqueo>("account-access/unlock", token, { method: "POST", body: JSON.stringify({ password }) });

export const listarCuentas = (token: string, ficha: string) => pedir<CuentaEmpresa[]>("account-access/users", token, {}, ficha);

export const restablecerContrasena = (token: string, ficha: string, userId: number) =>
  pedir<ContrasenaNueva>(`account-access/users/${userId}/reset-password`, token, { method: "POST" }, ficha);
