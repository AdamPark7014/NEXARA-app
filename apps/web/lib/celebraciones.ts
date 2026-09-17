import { buildApiUrl } from "@/lib/api-base";

/**
 * Cumpleaños y aniversarios de ingreso del equipo (GET me/celebraciones/hoy).
 *
 * La API nunca manda la edad: en cumpleaños `anios` llega null y aquí tampoco se usa.
 * En aniversarios `anios` son los años en NEXARA.
 */

export type TipoCelebracion = "cumpleanos" | "aniversario";

export type Celebracion = {
  userId: number;
  nombre: string;
  avatarUrl: string | null;
  tipo: TipoCelebracion;
  anios: number | null;
  soyYo: boolean;
};

export type CelebracionesHoy = {
  /** Día de la empresa, «AAAA-MM-DD». */
  fecha: string;
  celebraciones: Celebracion[];
};

export async function fetchCelebracionesHoy(token: string): Promise<CelebracionesHoy | null> {
  const res = await fetch(buildApiUrl("me/celebraciones/hoy"), {
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Partial<CelebracionesHoy> | null;
  if (!data || typeof data.fecha !== "string" || !Array.isArray(data.celebraciones)) return null;
  return { fecha: data.fecha, celebraciones: data.celebraciones };
}

/** Primer nombre para el saludo: «Carolina», no «Carolina Juárez Álvarez». */
export function primerNombre(nombre: string | null | undefined): string {
  const limpio = (nombre || "").trim().split(/\s+/)[0] || "";
  return limpio ? limpio.charAt(0).toUpperCase() + limpio.slice(1) : "";
}

const tiempoEnNexara = (anios: number) => (anios === 1 ? "1 año" : `${anios} años`);

/**
 * Texto del aviso: `titulo` en negritas y `detalle` a un lado.
 * Cumpleaños nunca menciona años; aniversario solo los años en la empresa.
 */
export function textoCelebracion(c: Celebracion): { titulo: string; detalle: string | null } {
  const anios = c.tipo === "aniversario" && typeof c.anios === "number" && c.anios >= 1 ? c.anios : null;
  if (c.soyYo) {
    const quien = primerNombre(c.nombre);
    if (c.tipo === "cumpleanos") {
      return {
        titulo: quien ? `¡Feliz cumpleaños, ${quien}! 🎂` : "¡Feliz cumpleaños! 🎂",
        detalle: "Todo el equipo te desea un gran día",
      };
    }
    return {
      titulo: quien ? `¡Felicidades, ${quien}! 🎉` : "¡Felicidades! 🎉",
      detalle: anios ? `Hoy cumples ${tiempoEnNexara(anios)} en NEXARA` : "Hoy es tu aniversario en NEXARA",
    };
  }
  const quien = (c.nombre || "").trim() || "alguien del equipo";
  if (c.tipo === "cumpleanos") {
    return { titulo: `Hoy es cumpleaños de ${quien} 🎂`, detalle: null };
  }
  return {
    titulo: anios ? `${quien} cumple ${tiempoEnNexara(anios)} en NEXARA 🎉` : `Hoy es aniversario de ${quien} en NEXARA 🎉`,
    detalle: null,
  };
}

/** Las propias primero; después el resto en el orden de la API (alfabético). */
export function ordenarCelebraciones(lista: Celebracion[]): Celebracion[] {
  return [...lista].sort((a, b) => Number(b.soyYo) - Number(a.soyYo));
}

const CERRADO_KEY_PREFIX = "nx_celebraciones_cerrado";

const cerradoKey = (userId?: number | null) => (userId ? `${CERRADO_KEY_PREFIX}:${userId}` : CERRADO_KEY_PREFIX);

/** ¿Ya cerró el aviso de esta fecha? Sin localStorage (modo privado, bloqueado) cuenta como no cerrado. */
export function celebracionCerrada(fecha: string, userId?: number | null): boolean {
  try {
    return window.localStorage.getItem(cerradoKey(userId)) === fecha;
  } catch {
    return false;
  }
}

/** Recuerda que cerró el aviso de esta fecha; al día siguiente vuelve a salir si hay celebración. */
export function cerrarCelebracion(fecha: string, userId?: number | null): void {
  try {
    window.localStorage.setItem(cerradoKey(userId), fecha);
  } catch {
    /* sin almacenamiento: se oculta solo en esta visita */
  }
}
