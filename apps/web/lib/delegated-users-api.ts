/**
 * Alta de usuarios por quien tiene el permiso delegado (Antonio, David, Luis) o por dirección.
 * Consume `GET /users/delegated/roles` y `POST /users/delegated` (`apps/api/src/users`).
 *
 * La contraseña se escribe (o se genera aquí, en el navegador) y viaja una sola vez al API, que la guarda
 * solo como hash: nunca vuelve en ninguna respuesta.
 */
import { buildApiUrl } from "@/lib/api-base";

export type TipoUsuario = { roleKey: string; etiqueta: string };

export type UsuarioCreado = {
  id: number;
  nombre: string;
  email: string;
  roleKey: string;
  departmentId: number | null;
  employeeNumber: string | null;
  managerId: number | null;
};

export type AltaUsuario = {
  nombre: string;
  email: string;
  password: string;
  roleKey: string;
};

/** Tipos que esta persona puede dar de alta. Cualquier fallo = ninguno (no se ofrece el botón). */
export async function listarTiposCreables(token: string): Promise<TipoUsuario[]> {
  try {
    const res = await fetch(buildApiUrl("users/delegated/roles"), {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data)
      ? (data as TipoUsuario[]).filter((t) => t && typeof t.roleKey === "string" && typeof t.etiqueta === "string")
      : [];
  } catch {
    return [];
  }
}

export async function crearUsuarioDelegado(token: string, alta: AltaUsuario): Promise<UsuarioCreado> {
  const res = await fetch(buildApiUrl("users/delegated"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(alta),
  });
  if (!res.ok) {
    let mensaje = "No se pudo dar de alta al usuario. Intenta de nuevo.";
    try {
      const cuerpo = (await res.json()) as { message?: string | string[] };
      const m = Array.isArray(cuerpo?.message) ? cuerpo.message.join(" ") : cuerpo?.message;
      if (m) mensaje = m;
    } catch {
      /* se queda el mensaje general */
    }
    throw new Error(mensaje);
  }
  return (await res.json()) as UsuarioCreado;
}

// Sin 0/O, 1/l/I: se lee y se dicta sin confusiones.
const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MINUSCULAS = "abcdefghijkmnpqrstuvwxyz";
const NUMEROS = "23456789";
const ALFABETO = MAYUSCULAS + MINUSCULAS + NUMEROS;

function aleatorio(max: number): number {
  const buf = new Uint32Array(1);
  const limite = Math.floor(0x100000000 / max) * max; // sin sesgo
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limite);
  return buf[0] % max;
}

/** Contraseña aleatoria legible (14 por omisión) con mayúscula, minúscula y número. */
export function generarContrasena(largo = 14): string {
  const n = Math.max(10, largo);
  const chars = [
    MAYUSCULAS[aleatorio(MAYUSCULAS.length)],
    MINUSCULAS[aleatorio(MINUSCULAS.length)],
    NUMEROS[aleatorio(NUMEROS.length)],
  ];
  while (chars.length < n) chars.push(ALFABETO[aleatorio(ALFABETO.length)]);
  // Baraja para que las tres obligatorias no queden siempre al inicio.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = aleatorio(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Igual que el API: 8+ caracteres con letra y número. */
export function contrasenaAceptable(valor: string): boolean {
  return valor.length >= 8 && valor.length <= 72 && /[A-Za-z]/.test(valor) && /\d/.test(valor);
}
