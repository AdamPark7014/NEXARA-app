/**
 * Alta de usuarios por quien tiene el permiso delegado (Antonio, David, Luis) o por dirección.
 * Consume `GET /users/delegated/roles` y `POST /users/delegated` (`apps/api/src/users`).
 *
 * La contraseña se escribe (o se genera aquí, en el navegador) y viaja una sola vez al API, que la guarda
 * solo como hash: nunca vuelve en ninguna respuesta.
 */
import { buildApiUrl } from "@/lib/api-base";

export type TipoUsuario = { roleKey: string; etiqueta: string };

export type OpcionAlta = { id: number; nombre: string };

export type PersonaEquipo = {
  id: number;
  nombre: string;
  avatarUrl: string | null;
  telefono: string | null;
};

export type ContextoAlta = {
  formulario: "basico" | "completo";
  tipos: TipoUsuario[];
  rolAutomatico: boolean;
  jefeAutomatico: boolean;
  telefonoObligatorio: boolean;
  puede: boolean;
  departamentos: OpcionAlta[];
  jefes: OpcionAlta[];
  equipo: PersonaEquipo[];
};

export type UsuarioCreado = {
  id: number;
  nombre: string;
  email: string;
  roleKey: string;
  departmentId: number | null;
  employeeNumber: string | null;
  managerId: number | null;
  avatarUrl?: string | null;
  telefono?: string | null;
};

export type AltaUsuario = {
  nombre: string;
  email: string;
  password: string;
  roleKey?: string;
  telefono?: string;
  departmentId?: number;
  managerId?: number;
  employeeNumber?: string;
  foto?: File | null;
};

const CONTEXTO_VACIO: ContextoAlta = {
  formulario: "basico",
  tipos: [],
  rolAutomatico: false,
  jefeAutomatico: true,
  telefonoObligatorio: true,
  puede: false,
  departamentos: [],
  jefes: [],
  equipo: [],
};

function esTipo(t: unknown): t is TipoUsuario {
  return Boolean(t) && typeof (t as TipoUsuario).roleKey === "string" && typeof (t as TipoUsuario).etiqueta === "string";
}

function opciones(lista: unknown): OpcionAlta[] {
  if (!Array.isArray(lista)) return [];
  return lista.filter(
    (o): o is OpcionAlta => Boolean(o) && typeof (o as OpcionAlta).id === "number" && typeof (o as OpcionAlta).nombre === "string",
  );
}

/** Acepta el objeto nuevo y, por si acaso, la lista plana de tipos que devolvía el API antes. */
export function interpretarContexto(data: unknown): ContextoAlta {
  if (Array.isArray(data)) {
    const tipos = data.filter(esTipo);
    const uno = tipos.length === 1;
    return {
      ...CONTEXTO_VACIO,
      tipos,
      formulario: tipos.length > 1 ? "completo" : "basico",
      rolAutomatico: uno,
      jefeAutomatico: tipos.length <= 1,
      telefonoObligatorio: uno,
      puede: tipos.length > 0,
    };
  }
  if (!data || typeof data !== "object") return CONTEXTO_VACIO;
  const d = data as Partial<ContextoAlta>;
  const tipos = Array.isArray(d.tipos) ? d.tipos.filter(esTipo) : [];
  if (!d.puede || tipos.length === 0) return CONTEXTO_VACIO;
  const formulario = d.formulario === "completo" ? "completo" : "basico";
  return {
    formulario,
    tipos,
    rolAutomatico: typeof d.rolAutomatico === "boolean" ? d.rolAutomatico : formulario === "basico" && tipos.length === 1,
    jefeAutomatico: typeof d.jefeAutomatico === "boolean" ? d.jefeAutomatico : formulario === "basico",
    telefonoObligatorio: typeof d.telefonoObligatorio === "boolean" ? d.telefonoObligatorio : formulario === "basico",
    puede: true,
    departamentos: opciones(d.departamentos),
    jefes: opciones(d.jefes),
    equipo: Array.isArray(d.equipo)
      ? d.equipo.filter(
          (p): p is PersonaEquipo =>
            Boolean(p) && typeof (p as PersonaEquipo).id === "number" && typeof (p as PersonaEquipo).nombre === "string",
        )
      : [],
  };
}

async function mensajeDeError(res: Response, fallback: string): Promise<string> {
  try {
    const cuerpo = (await res.json()) as { message?: string | string[] };
    const m = Array.isArray(cuerpo?.message) ? cuerpo.message.join(" ") : cuerpo?.message;
    if (m) return m;
  } catch {
    /* se queda el mensaje general */
  }
  return fallback;
}

/** Lo que esta persona puede dar de alta. Cualquier fallo = nada (no se ofrece el módulo). */
export async function cargarContextoAlta(token: string): Promise<ContextoAlta> {
  try {
    const res = await fetch(buildApiUrl("users/delegated/contexto"), {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return CONTEXTO_VACIO;
    return interpretarContexto(await res.json());
  } catch {
    return CONTEXTO_VACIO;
  }
}

/** Tipos que esta persona puede dar de alta. Cualquier fallo = ninguno (no se ofrece el botón). */
export async function listarTiposCreables(token: string): Promise<TipoUsuario[]> {
  return (await cargarContextoAlta(token)).tipos;
}

export async function crearUsuarioDelegado(token: string, alta: AltaUsuario): Promise<UsuarioCreado> {
  const cuerpo = new FormData();
  cuerpo.append("nombre", alta.nombre);
  cuerpo.append("email", alta.email);
  cuerpo.append("password", alta.password);
  if (alta.roleKey) cuerpo.append("roleKey", alta.roleKey);
  if (alta.telefono) cuerpo.append("telefono", alta.telefono);
  if (alta.departmentId) cuerpo.append("departmentId", String(alta.departmentId));
  if (alta.managerId) cuerpo.append("managerId", String(alta.managerId));
  if (alta.employeeNumber) cuerpo.append("employeeNumber", alta.employeeNumber);
  if (alta.foto) cuerpo.append("avatar", alta.foto, alta.foto.name || "avatar.jpg");
  const res = await fetch(buildApiUrl("users/delegated"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
    body: cuerpo,
  });
  if (!res.ok) throw new Error(await mensajeDeError(res, "No se pudo dar de alta al usuario. Intenta de nuevo."));
  return (await res.json()) as UsuarioCreado;
}

/** Cambia la foto fija (o el teléfono) de alguien que ya está en el equipo. */
export async function cambiarFotoEquipo(
  token: string,
  userId: number,
  cambio: { foto?: File | null; telefono?: string },
): Promise<{ id: number; nombre: string; avatarUrl: string | null }> {
  const cuerpo = new FormData();
  if (cambio.telefono) cuerpo.append("telefono", cambio.telefono);
  if (cambio.foto) cuerpo.append("avatar", cambio.foto, cambio.foto.name || "avatar.jpg");
  const res = await fetch(buildApiUrl(`users/delegated/${userId}`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
    body: cuerpo,
  });
  if (!res.ok) throw new Error(await mensajeDeError(res, "No se pudo cambiar la foto."));
  return (await res.json()) as { id: number; nombre: string; avatarUrl: string | null };
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
