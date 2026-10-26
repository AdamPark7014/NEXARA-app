"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAPLIBRE_WORKER_URL } from "@/app/components/BrandMap";
import s from "./recorrido-mapa.module.css";

/**
 * Mapa del recorrido de una jornada: línea de la ruta, un punto por ubicación, inicio y fin.
 *
 * Antes era una imagen de `/api/static-map`, que pide el mapa a Google Static Maps desde el
 * servidor. Sin facturación en Google Cloud (al 23-10-2026) Google contesta 403 «You must enable
 * Billing», el API responde 503 y la imagen salía rota. Este mapa se dibuja en el navegador con
 * MapLibre y teselas de OpenFreeMap, igual que el mapa del sitio público: sin clave ni costo.
 */

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const COLOR_RUTA = "#2563eb";
const COLOR_INICIO = "#16a34a";
const COLOR_FIN = "#1d4ed8";

type MapLibreModule = typeof import("maplibre-gl");
let libPromise: Promise<MapLibreModule> | null = null;
const loadMapLibre = (): Promise<MapLibreModule> => {
  if (!libPromise) {
    libPromise = import("maplibre-gl").then((lib) => {
      lib.setWorkerUrl(MAPLIBRE_WORKER_URL);
      return lib;
    });
  }
  return libPromise;
};

export type PuntoMapa = { lat: number; lng: number };

/** GeoJSON de la ruta y de sus puntos (inicio, intermedios y fin). Exportado para probarlo. */
export function geojsonRecorrido(puntos: PuntoMapa[]) {
  const coords = puntos.map((p) => [p.lng, p.lat] as [number, number]);
  return {
    ruta: {
      type: "FeatureCollection" as const,
      features:
        coords.length > 1
          ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } }]
          : [],
    },
    puntos: {
      type: "FeatureCollection" as const,
      features: coords.map((c, i) => ({
        type: "Feature" as const,
        properties: { tipo: i === 0 ? "inicio" : i === coords.length - 1 ? "fin" : "punto" },
        geometry: { type: "Point" as const, coordinates: c },
      })),
    },
  };
}

export default function RecorridoMapa({
  puntos,
  altura = 280,
  enlaceMaps,
}: {
  puntos: PuntoMapa[];
  altura?: number;
  /** Ruta en Google Maps, para cuando el mapa no pueda dibujarse. */
  enlaceMaps?: string | null;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "fallo">("cargando");
  const datos = useMemo(() => geojsonRecorrido(puntos), [puntos]);
  const datosRef = useRef(datos);
  datosRef.current = datos;

  const encuadrar = (map: MapLibreMap, lib: MapLibreModule | null) => {
    const coords = datosRef.current.puntos.features.map((f) => f.geometry.coordinates);
    if (!coords.length) return;
    if (coords.length === 1 || !lib) {
      map.jumpTo({ center: coords[0]!, zoom: 15 });
      return;
    }
    const bounds = new lib.LngLatBounds(coords[0]!, coords[0]!);
    for (const c of coords) bounds.extend(c);
    map.fitBounds(bounds, { padding: 36, maxZoom: 16, duration: 0 });
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !puntos.length) return;
    let cancelado = false;
    let lib: MapLibreModule | null = null;
    let falla: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      try {
        lib = await loadMapLibre();
        if (cancelado) return;
        const first = datosRef.current.puntos.features[0]!.geometry.coordinates;
        const map = new lib.Map({
          container: host,
          style: STYLE_URL,
          center: first,
          zoom: 14,
          attributionControl: { compact: true },
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        mapRef.current = map;
        map.touchZoomRotate.disableRotation();
        map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          if (cancelado) return;
          if (falla) clearTimeout(falla);
          map.addSource("ruta", { type: "geojson", data: datosRef.current.ruta });
          map.addSource("puntos", { type: "geojson", data: datosRef.current.puntos });
          map.addLayer({
            id: "ruta-linea",
            type: "line",
            source: "ruta",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": COLOR_RUTA, "line-width": 3.5, "line-opacity": 0.85 },
          });
          map.addLayer({
            id: "ruta-puntos",
            type: "circle",
            source: "puntos",
            paint: {
              "circle-radius": ["match", ["get", "tipo"], "punto", 4.5, 7],
              "circle-color": ["match", ["get", "tipo"], "inicio", COLOR_INICIO, "fin", COLOR_FIN, COLOR_RUTA],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });
          encuadrar(map, lib);
          setEstado("listo");
        });
        falla = setTimeout(() => {
          if (!cancelado && !map.loaded()) setEstado("fallo");
        }, 12_000);
      } catch {
        // Sin WebGL o sin red a las teselas: queda el enlace a Maps.
        if (!cancelado) setEstado("fallo");
      }
    })();

    return () => {
      cancelado = true;
      if (falla) clearTimeout(falla);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // El mapa se crea una vez por montaje; los cambios de puntos se aplican abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos.length > 0]);

  // El recorrido creció (refresco de la pantalla): se actualizan las fuentes sin rehacer el mapa.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || estado !== "listo") return;
    (map.getSource("ruta") as GeoJSONSource | undefined)?.setData(datos.ruta);
    (map.getSource("puntos") as GeoJSONSource | undefined)?.setData(datos.puntos);
  }, [datos, estado]);

  if (!puntos.length) return null;

  return (
    <div className={s.marco} style={{ height: altura }} data-estado={estado}>
      <div ref={hostRef} className={s.mapa} role="img" aria-label={`Mapa del recorrido con ${puntos.length} ubicaciones`} />
      {estado === "cargando" ? <div className={s.aviso}>Cargando mapa del recorrido…</div> : null}
      {estado === "fallo" ? (
        <div className={s.aviso}>
          No se pudo dibujar el mapa.
          {enlaceMaps ? (
            <a href={enlaceMaps} target="_blank" rel="noopener noreferrer">
              Ver recorrido en Maps
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
