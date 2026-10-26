import { buildApiUrl } from "@/lib/api-base";

export type Integrante = { clave: string; nombre: string; rol: string };

/** Si la API no responde, el equipo que ya mostraba Nosotros. */
const RESPALDO: Integrante[] = [
  { clave: "r-1", nombre: "Ing. Alejandro Gonzales Bustamante", rol: "Ingeniero de Sistemas" },
  { clave: "r-2", nombre: "Ing. Carolina Juarez Alvarez", rol: "Ingeniera de soporte" },
  { clave: "r-3", nombre: "Ing. David Morales Zenon", rol: "IDC / Instalador" },
  { clave: "r-4", nombre: "Ing. Julio Cesar Rivera Vazquez", rol: "IDC / Instalador" },
  { clave: "r-5", nombre: "Ing. Israel Ramos Lima", rol: "IDC / Instalador" },
];

/** Equipo público de `users/public-team`, sin cuentas internas ni de prueba. Solo nombre y puesto. */
export async function equipoPublico(limite = 12): Promise<Integrante[]> {
  try {
    const res = await fetch(buildApiUrl(`users/public-team?limit=${limite}`), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return RESPALDO;
    const filas = (await res.json()) as { id: number; nombre?: string; role?: { nombre?: string | null } | null }[];
    const visibles = Array.isArray(filas)
      ? filas.filter((u) => u.nombre && !/revisor\s*google\s*play|reviewer|cuenta\s*de\s*prueba/i.test(u.nombre))
      : [];
    if (!visibles.length) return RESPALDO;
    return visibles.map((u) => ({ clave: String(u.id), nombre: u.nombre as string, rol: u.role?.nombre || "Especialista" }));
  } catch {
    return RESPALDO;
  }
}

export const iniciales = (nombre: string) =>
  (
    nombre
      .replace(/^(ing|lic|arq|dr|dra|mtro|mtra)\.?\s+/i, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("") || "NX"
  ).slice(0, 2);
