"use client";

import { getActiveCompanyId } from "@/lib/tenant";
import { getActiveIntegraSiteId, integraApi } from "./_lib";

/**
 * Arranque en paralelo de la consola INTEGRA.
 *
 * ## El problema que resuelve
 *
 * Al entrar en `/integra/video` había cinco viajes al servidor antes del primer
 * píxel útil, y cada uno lo lanzaba un componente distinto en el momento en que
 * a ese componente le tocaba montar:
 *
 *   1. `_IntegraChrome` → `integra/capabilities`
 *   2. `_IntegraChrome` → `integra/health` + `integra/dashboard`
 *   3. `_IntegraChrome` → `/api/health` (estado de go2rtc)
 *   4. la página        → `integra/cameras`
 *   5. la página        → N × `POST integra/cameras/:id/stream`
 *
 * Ninguno de los cuatro primeros depende del anterior: son cuatro respuestas
 * independientes que se pintan en sitios distintos de la pantalla. Aun cuando
 * React los dispare en el mismo tick, dependían de que **cada componente
 * llegara a montar**, y el que manda es `AppShell`: hasta que no hay `user` no
 * renderiza a sus hijos, así que el árbol de INTEGRA no existe todavía y no hay
 * ni una petición en vuelo.
 *
 * Aquí se separa *cuándo se pide* de *quién lo pinta*. El layout dispara las
 * cuatro peticiones de golpe en su primer commit —antes de que `AppShell`
 * decida si deja pasar a los hijos— y cada componente, al montar, recoge la
 * respuesta que ya viene volando en vez de empezar la suya.
 *
 * ## Reglas
 *
 * - **Se dispara todo junto o no se dispara.** `lanzarArranque` llama a las
 *   funciones de petición de forma síncrona, una detrás de otra, sin ningún
 *   `await` de por medio: al salir de la función las cuatro están en vuelo.
 * - **La clave manda.** Una respuesta pedida para la empresa 7 / sitio 3 no
 *   vale para la empresa 7 / sitio 4. Si la clave no coincide, `tomarArranque`
 *   devuelve `null` y el consumidor hace su petición de siempre.
 * - **Un solo uso.** El refresco periódico (30 s) y el botón «Actualizar» tienen
 *   que hablar con el servidor de verdad; solo el primer consumidor recoge la
 *   promesa adelantada.
 */

export type RecursoArranque =
  | "capabilities"
  | "health"
  | "dashboard"
  | "cameras"
  | "media";

/** Los cuatro viajes independientes del arranque, en el orden en que se lanzan. */
export const RECURSOS_ARRANQUE: readonly RecursoArranque[] = [
  "capabilities",
  "health",
  "dashboard",
  "cameras",
  "media",
] as const;

export type PeticionesArranque = Partial<Record<RecursoArranque, () => Promise<unknown>>>;

type Registro = {
  clave: string;
  enVuelo: Map<RecursoArranque, Promise<unknown>>;
};

let registro: Registro | null = null;

/**
 * Identidad de un arranque: empresa activa + sitio activo. Es lo que decide si
 * una respuesta adelantada sigue sirviendo.
 */
export function claveArranque(companyId: number | null, siteId: number | null): string {
  return `${companyId ?? "-"}:${siteId ?? "-"}`;
}

/** La clave de ahora mismo, leída de `localStorage` (empresa y sitio activos). */
export function claveArranqueActual(): string {
  return claveArranque(getActiveCompanyId(), getActiveIntegraSiteId());
}

/**
 * Lanza todas las peticiones **a la vez**. Si ya hay un arranque en curso con
 * la misma clave no se repite: montar dos veces (StrictMode en desarrollo) no
 * puede duplicar el tráfico.
 */
export function lanzarArranque(clave: string, peticiones: PeticionesArranque): void {
  if (registro?.clave === clave) return;
  const enVuelo = new Map<RecursoArranque, Promise<unknown>>();
  for (const recurso of RECURSOS_ARRANQUE) {
    const pedir = peticiones[recurso];
    if (!pedir) continue;
    const promesa = pedir();
    // El arranque es especulativo: si alguna falla —401 porque la sesión ya no
    // vale, backend caído— no puede reventar la consola con un rechazo sin
    // atender. El consumidor real verá el error por su propio `catch`.
    promesa.catch(() => undefined);
    enVuelo.set(recurso, promesa);
  }
  registro = { clave, enVuelo };
}

/**
 * Recoge la respuesta adelantada de un recurso, si la hay para esta clave.
 * Devuelve `null` cuando no se adelantó, cuando ya la recogió otro, o cuando el
 * sitio/empresa cambió — en los tres casos el consumidor pide él mismo.
 */
export function tomarArranque<T>(recurso: RecursoArranque, clave: string): Promise<T> | null {
  if (!registro || registro.clave !== clave) return null;
  const promesa = registro.enVuelo.get(recurso);
  if (!promesa) return null;
  registro.enVuelo.delete(recurso);
  return promesa as Promise<T>;
}

/** Tira el arranque en curso (cambio de sitio, cierre de sesión, pruebas). */
export function olvidarArranque(): void {
  registro = null;
}

/** Solo para pruebas y diagnóstico: qué queda por recoger. */
export function recursosPendientes(): RecursoArranque[] {
  return registro ? [...registro.enVuelo.keys()] : [];
}

const CLAVE_SESION = "nexara_user";

/**
 * ¿Hay sesión guardada en este navegador? Sin ella el arranque adelantado solo
 * conseguiría cuatro 401 y una redirección a `/login`, así que no se lanza.
 * Es la misma fuente que lee `UserContext` al hidratar.
 */
export function haySesionAlmacenada(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(
      window.sessionStorage.getItem(CLAVE_SESION) ||
        window.localStorage.getItem(CLAVE_SESION),
    );
  } catch {
    return false;
  }
}

/**
 * Las peticiones reales del arranque. Se mantienen aparte del registro para que
 * la lógica de arriba se pueda probar sin red.
 */
export function peticionesRealesArranque(): PeticionesArranque {
  return {
    capabilities: () => integraApi<unknown>("integra/capabilities"),
    health: () => integraApi<unknown>("integra/health"),
    dashboard: () => integraApi<unknown>("integra/dashboard"),
    cameras: () => integraApi<unknown>("integra/cameras"),
    // El estado del media server no sale del API de INTEGRA sino de la ruta de
    // salud del propio Next (mismo origen), así que va por `fetch` pelado.
    media: () =>
      fetch("/api/health", { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
        .catch(() => null),
  };
}

/**
 * Punto de entrada del layout: dispara los cuatro viajes independientes en el
 * primer instante en que hay JavaScript corriendo en la página.
 */
export function arrancarConsolaIntegra(): void {
  if (typeof window === "undefined") return;
  if (!haySesionAlmacenada()) return;
  lanzarArranque(claveArranqueActual(), peticionesRealesArranque());
}
