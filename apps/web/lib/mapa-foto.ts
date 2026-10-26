"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { ESTILO_MAPA_URL, cargarMapLibre } from "@/lib/maplibre-cargar";
import { hasUsableCoords } from "@/lib/static-map";

/**
 * «Foto» de un mapa: MapLibre lo dibuja una vez fuera de la pantalla, se guarda como imagen y el
 * mapa se destruye.
 *
 * Es lo que reemplaza a las imágenes de Google Static Maps en las vistas previas (solicitudes de
 * ticket, mapa de llegada, cola de OPS): ahí no hace falta mover el mapa, solo verlo, y una lista
 * con veinte mapas vivos agotaría los contextos WebGL del navegador (Chrome tira el más viejo pasando
 * de ~16). Con la foto hay un solo mapa vivo a la vez (cola) y cada punto se dibuja una vez por
 * pestaña (caché en memoria).
 */

export type PedidoFoto = {
  lat: number;
  lng: number;
  zoom?: number;
  /** Tamaño en píxeles CSS. */
  ancho: number;
  alto: number;
};

/** Clave de caché: 5 decimales (≈1 m) y tamaño redondeado, para reutilizar la misma foto. */
export function claveFoto(p: PedidoFoto): string {
  const r = (n: number) => Number(n.toFixed(5));
  const t = (n: number) => Math.max(50, Math.round(n / 50) * 50);
  return `${r(p.lat)},${r(p.lng)}@${p.zoom ?? 15}:${t(p.ancho)}x${t(p.alto)}`;
}

const cache = new Map<string, Promise<string | null>>();
let cola: Promise<unknown> = Promise.resolve();

/** Data URL (JPEG) del mapa centrado en el punto, o `null` si no se pudo dibujar. */
export function fotoDeMapa(p: PedidoFoto): Promise<string | null> {
  if (!hasUsableCoords(p.lat, p.lng)) return Promise.resolve(null);
  const clave = claveFoto(p);
  const previa = cache.get(clave);
  if (previa) return previa;
  const tarea = cola.then(() => dibujar(p)).catch(() => null);
  cola = tarea;
  cache.set(clave, tarea);
  // Un fallo no se queda en caché: el siguiente intento vuelve a probar.
  void tarea.then((url) => {
    if (!url) cache.delete(clave);
  });
  return tarea;
}

const PLAZO_MS = 15_000;

async function dibujar(p: PedidoFoto): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const lib = await cargarMapLibre();
  const ancho = Math.max(50, Math.min(1200, Math.round(p.ancho)));
  const alto = Math.max(50, Math.min(800, Math.round(p.alto)));
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${ancho}px`,
    height: `${alto}px`,
    pointerEvents: "none",
  });
  host.setAttribute("aria-hidden", "true");
  document.body.appendChild(host);
  let map: MapLibreMap | null = null;
  try {
    map = new lib.Map({
      container: host,
      style: ESTILO_MAPA_URL,
      center: [p.lng, p.lat],
      zoom: p.zoom ?? 15,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      // Sin esto el lienzo se borra después de cada cuadro y la foto sale en blanco.
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    const listo = await new Promise<boolean>((resolve) => {
      const plazo = window.setTimeout(() => resolve(false), PLAZO_MS);
      map!.once("idle", () => {
        window.clearTimeout(plazo);
        resolve(true);
      });
    });
    if (!listo) return null;
    return map.getCanvas().toDataURL("image/jpeg", 0.86);
  } catch {
    return null;
  } finally {
    map?.remove();
    host.remove();
  }
}
