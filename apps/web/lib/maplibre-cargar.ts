"use client";

import { MAPLIBRE_WORKER_URL } from "@/app/components/BrandMap";

/**
 * MapLibre para los mapas del panel (recorrido, ubicación de sucursal, vistas previas).
 *
 * Google Static Maps y el SDK de Maps dejaron de responder (403 «You must enable Billing»: el
 * proyecto de Google Cloud no tiene facturación). Estos mapas se dibujan en el navegador con
 * MapLibre y teselas vectoriales de OpenFreeMap, sin clave ni costo, igual que el mapa del sitio
 * público (`app/components/BrandMap.tsx`, que explica por qué el worker se sirve desde /public).
 *
 * La librería se carga solo cuando un mapa la pide: no pesa en la carga de ninguna página.
 */

export type MapLibreModule = typeof import("maplibre-gl");

/** Estilo claro y neutro de OpenFreeMap. */
export const ESTILO_MAPA_URL = "https://tiles.openfreemap.org/styles/positron";

/** Centro de Puebla: dónde abre un mapa que todavía no tiene punto. */
export const CENTRO_PREDETERMINADO: [number, number] = [-98.2063, 19.0414];

let libPromise: Promise<MapLibreModule> | null = null;

export function cargarMapLibre(): Promise<MapLibreModule> {
  if (!libPromise) {
    libPromise = import("maplibre-gl")
      .then((lib) => {
        lib.setWorkerUrl(MAPLIBRE_WORKER_URL);
        return lib;
      })
      .catch((err) => {
        // Que el siguiente intento vuelva a probar (red caída al cargar el chunk).
        libPromise = null;
        throw err;
      });
  }
  return libPromise;
}
