"use client";
import { useEffect, useState } from "react";

export type MapProviderInfo = {
  provider: "google" | "osm";
  src: string;
  link: string;
};

/** Mapa de respaldo (OpenStreetMap, sin clave) por si la ruta interna no responde. */
const FALLBACK: MapProviderInfo = {
  provider: "osm",
  src: "https://www.openstreetmap.org/export/embed.html?bbox=-98.283838,19.070203,-98.271838,19.077403&layer=mapnik&marker=19.073803,-98.277838",
  link: "https://maps.app.goo.gl/34XSHPwUSeMAB7x69",
};

let cached: MapProviderInfo | null = null;
let inflight: Promise<MapProviderInfo> | null = null;

const load = (): Promise<MapProviderInfo> => {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch("/mapa/proveedor", { cache: "force-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<MapProviderInfo>) : FALLBACK))
      .then((info) => {
        cached = info && info.src ? info : FALLBACK;
        return cached;
      })
      .catch(() => {
        cached = FALLBACK;
        return cached;
      });
  }
  return inflight;
};

/**
 * Devuelve el proveedor de mapa embebido que sí carga en este despliegue
 * (Google si la clave tiene Maps Embed API; si no, OpenStreetMap). `null`
 * mientras se resuelve, para no pintar un iframe que luego cambia.
 */
export function useMapProvider(): MapProviderInfo | null {
  const [info, setInfo] = useState<MapProviderInfo | null>(cached);
  useEffect(() => {
    let alive = true;
    load().then((v) => {
      if (alive) setInfo(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return info;
}
