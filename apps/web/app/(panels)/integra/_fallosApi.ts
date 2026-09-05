"use client";

/**
 * Fallos de la API de INTEGRA con el código de estado intacto.
 *
 * `integraApi` (en `_lib.ts`) lanza un `Error` pelado: se queda con el texto del
 * cuerpo y **tira el `res.status`**. Para la consola eso significa que «no tienes
 * permiso» (403) y «el servidor no responde» (502) llegan a la pantalla como la
 * misma cadena gris, y el operador no puede saber si el problema es suyo, de su
 * rol, o del backend. Aquí el estado viaja pegado al error para poder decírselo.
 *
 * No sustituye a `integraApi`: es la variante para las pantallas que necesitan
 * dar un diagnóstico y no solo un mensaje.
 */

import { buildApiUrl } from "@/lib/api-base";
import { withTenantHeaders } from "@/lib/tenant";
import { withSiteQuery } from "./_lib";

/**
 * Error de la API con su código HTTP.
 *
 * `status === null` significa que la petición **ni siquiera llegó a salir**
 * (DNS, red caída, CORS, backend apagado). Es un caso distinto de un 500: en
 * uno el servidor contestó mal, en el otro no contestó.
 */
export class FalloApi extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "FalloApi";
    this.status = status;
  }
}

/** Nest devuelve `message` como cadena, como array (ValidationPipe) o anidado. */
function extraerMensaje(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const m = (body as { message?: unknown }).message;
  if (typeof m === "string") return m;
  if (Array.isArray(m)) {
    const partes = m.filter((x): x is string => typeof x === "string");
    if (partes.length > 0) return partes.join(" · ");
  }
  if (m && typeof m === "object") {
    const interno = (m as { message?: unknown }).message;
    if (typeof interno === "string") return interno;
  }
  const detalle = (body as { detail?: unknown }).detail;
  return typeof detalle === "string" ? detalle : "";
}

/** Igual que `integraApi`, pero el error que lanza conserva el `status`. */
export async function pedirIntegra<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(buildApiUrl(withSiteQuery(path)), {
      ...init,
      credentials: "include",
      headers: new Headers(
        withTenantHeaders({
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        }),
      ),
    });
  } catch (e) {
    // `fetch` solo rechaza cuando la petición no salió; un 500 se resuelve.
    throw new FalloApi(e instanceof Error ? e.message : "Sin conexión", null);
  }

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new FalloApi(extraerMensaje(body) || `HTTP ${res.status}`, res.status);
  }

  return (await res.json()) as T;
}

export type Diagnostico = {
  /** Qué ha pasado, en una línea. */
  titulo: string;
  /** Qué significa y qué puede hacer quien lo lee. */
  cuerpo: string;
  /** `warn` = el servidor está bien y el problema es de permisos o de datos. */
  tono: "danger" | "warn";
  /** Si reintentar tiene alguna posibilidad de arreglarlo. */
  reintentable: boolean;
};

/**
 * Traduce un fallo a algo accionable.
 *
 * `queSeIntentaba` se redacta como infinitivo en minúscula («cargar la
 * bitácora», «borrar el vehículo») porque se incrusta en la frase.
 */
export function diagnosticar(error: unknown, queSeIntentaba: string): Diagnostico {
  const detalle = error instanceof Error && error.message ? error.message.trim() : "";
  const status = error instanceof FalloApi ? error.status : undefined;

  if (status === null) {
    return {
      titulo: "El servidor no responde",
      cuerpo: `La petición para ${queSeIntentaba} no llegó a salir. Revisa tu conexión; si la red está bien, el backend está caído o reiniciándose.`,
      tono: "danger",
      reintentable: true,
    };
  }

  if (status === 401) {
    return {
      titulo: "Tu sesión caducó",
      cuerpo: `Vuelve a iniciar sesión para ${queSeIntentaba}. Reintentar aquí no va a servir de nada.`,
      tono: "warn",
      reintentable: false,
    };
  }

  if (status === 403) {
    return {
      titulo: "No tienes permiso",
      cuerpo:
        detalle ||
        `Tu rol no alcanza para ${queSeIntentaba}. Pídele acceso a un administrador.`,
      tono: "warn",
      reintentable: false,
    };
  }

  if (status === 404) {
    return {
      titulo: "Eso ya no está",
      cuerpo:
        detalle ||
        `No se encontró lo necesario para ${queSeIntentaba}. Puede que alguien lo haya borrado mientras tanto.`,
      tono: "warn",
      reintentable: false,
    };
  }

  if (status === 429) {
    return {
      titulo: "Demasiadas peticiones seguidas",
      cuerpo: `El servidor está limitando el ritmo. Espera unos segundos antes de ${queSeIntentaba} otra vez.`,
      tono: "warn",
      reintentable: true,
    };
  }

  if (status != null && status >= 400 && status < 500) {
    return {
      titulo: "El servidor rechazó la petición",
      cuerpo: detalle || `No se pudo ${queSeIntentaba} (HTTP ${status}).`,
      tono: "danger",
      reintentable: false,
    };
  }

  if (status != null && status >= 500) {
    return {
      titulo: "El servidor falló",
      cuerpo: detalle
        ? `${detalle} (HTTP ${status})`
        : `Error interno al ${queSeIntentaba} (HTTP ${status}).`,
      tono: "danger",
      reintentable: true,
    };
  }

  // Error que no pasó por `pedirIntegra`: no hay estado del que tirar.
  return {
    titulo: `No se pudo ${queSeIntentaba}`,
    cuerpo: detalle || "El motivo no llegó con el error.",
    tono: "danger",
    reintentable: true,
  };
}
