import { useEffect, useRef, useState } from "react";

/**
 * Regresar a donde estabas sin perder lo que filtraste (Velocidad Core, Ola 4).
 *
 * - `conRegreso` lleva en el enlace de dónde se viene (`?volver=`): sobrevive a recargar y solo acepta
 *   rutas de /erp. La ficha lo lee con `useRegreso`, o con `leerOrigen` en las actividades.
 * - `useFiltrosEnUrl` deja los filtros de una lista en la URL y en la pestaña del navegador: al volver
 *   por cualquier camino siguen puestos. Un enlace que trae filtros manda sobre lo guardado.
 *
 * Sin useSearchParams: evita el error de Suspense en build.
 */
export type Regreso = { href: string; label: string };

export const PARAM_REGRESO = "volver";

const ETIQUETAS: Array<[RegExp, string]> = [
  [/^\/erp\/proyectos\/\d+/, "Proyecto"],
  [/^\/erp\/proyectos/, "Proyectos"],
  [/^\/erp\/cotizaciones\/\d+/, "Cotización"],
  [/^\/erp\/cotizaciones/, "Cotizaciones"],
  [/^\/erp\/clientes\/\d+/, "Cliente"],
  [/^\/erp\/clientes/, "Clientes"],
  [/^\/erp\/actividades\/\d+/, "Actividad"],
  [/^\/erp\/asistencias\/indicadores/, "Desempeño"],
  [/^\/erp\/pizarra\/flujo/, "Flujo"],
  [/^\/erp\/pizarra/, "Pizarra"],
  [/^\/erp\/invoicing\/\d+/, "Factura"],
  [/^\/erp\/invoicing/, "Facturación"],
  [/^\/erp\/hr\/kpis/, "KPIs de RH"],
  [/^\/erp\/hr/, "Plantilla"],
];

/** Solo rutas internas de /erp: nada de otro dominio ni de `//host`. */
export function rutaDeRegresoValida(valor: string | null | undefined): string | null {
  if (!valor || valor.length > 600) return null;
  if (!/^\/erp(\/|\?|$)/.test(valor) || valor.includes("//") || valor.includes("\\")) return null;
  return valor;
}

export function etiquetaDeRegreso(ruta: string): string {
  return ETIQUETAS.find(([patron]) => patron.test(ruta))?.[1] ?? "Regresar";
}

/** El enlace, con de dónde se viene. `desde` vacío o no válido: el enlace tal cual. */
export function conRegreso(href: string, desde: string | null | undefined): string {
  const ruta = rutaDeRegresoValida(desde);
  if (!ruta) return href;
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const sinHash = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const queryAt = sinHash.indexOf("?");
  const q = new URLSearchParams(queryAt >= 0 ? sinHash.slice(queryAt + 1) : "");
  q.set(PARAM_REGRESO, ruta);
  return `${queryAt >= 0 ? sinHash.slice(0, queryAt) : sinHash}?${q.toString()}${hash}`;
}

/** De dónde se vino, según la URL; null si no lo dice. */
export function leerRegreso(search: string | URLSearchParams | null | undefined): Regreso | null {
  if (!search) return null;
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const href = rutaDeRegresoValida(q.get(PARAM_REGRESO));
  return href ? { href, label: etiquetaDeRegreso(href) } : null;
}

/** La flecha de una ficha: a donde dice la URL o, si no dice, a su lista. */
export function useRegreso(porOmision: Regreso): Regreso {
  const [leido, setLeido] = useState<Regreso | null>(null);
  useEffect(() => {
    setLeido(leerRegreso(window.location.search));
  }, []);
  return leido ?? porOmision;
}

/** La pantalla actual con su query, para llevarla en un enlace. Vacío al renderizar en el servidor. */
export function aqui(): string {
  return typeof window === "undefined" ? "" : window.location.pathname + window.location.search;
}

/** Cambia parámetros de la URL sin navegar. `null` los quita. */
export function reflejarEnUrl(cambios: Record<string, string | null>) {
  try {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(cambios)) {
      if (v == null) url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    }
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  } catch {
    /* sin History API: el filtro vale para esta visita */
  }
}

const GUARDA = "nexara.filtros:";
/** Mientras se escribe en el buscador no se reescribe la URL a cada tecla. */
const ESPERA_MS = 250;

/** Lo que había en esta lista: primero la URL; si no trae ninguno, lo guardado en la pestaña. */
export function filtrosAlAbrir(claves: string[], search: string, guardado: string | null): Record<string, string> {
  const q = new URLSearchParams(search);
  const deUrl = Object.fromEntries(claves.flatMap((k) => (q.get(k) != null ? [[k, q.get(k) as string]] : [])));
  if (Object.keys(deUrl).length) return deUrl;
  try {
    const leido = JSON.parse(guardado ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(claves.flatMap((k) => (typeof leido[k] === "string" && leido[k] ? [[k, leido[k] as string]] : [])));
  } catch {
    return {};
  }
}

/**
 * Deja los filtros de una lista en la URL. `valores`: nombre del parámetro y su valor, con `null` o
 * vacío cuando no hay filtro (la omisión no se escribe). `aplicar` recibe lo que había al abrir.
 */
export function useFiltrosEnUrl(valores: Record<string, string | null | undefined>, aplicar: (leidos: Record<string, string>) => void) {
  const listo = useRef(false);
  const clave = JSON.stringify(valores);
  useEffect(() => {
    let guardado: string | null = null;
    try {
      guardado = window.sessionStorage.getItem(GUARDA + window.location.pathname);
    } catch {
      /* sin storage: solo la URL */
    }
    const leidos = filtrosAlAbrir(Object.keys(valores), window.location.search, guardado);
    if (Object.keys(leidos).length) aplicar(leidos);
    listo.current = true;
    // Solo al abrir: lo que cambie después lo escribe el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!listo.current) return;
    const limpios = Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, v ? v : null]));
    const t = window.setTimeout(() => {
      reflejarEnUrl(limpios);
      try {
        window.sessionStorage.setItem(GUARDA + window.location.pathname, JSON.stringify(limpios));
      } catch {
        /* sin storage: solo la URL */
      }
    }, ESPERA_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
}
