"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

type MapLibreModule = typeof import("maplibre-gl");
import "maplibre-gl/dist/maplibre-gl.css";
import styles from "./Map.module.css";

/**
 * Mapa de marca de NEXARA: vectorial, renderizado en el sitio con MapLibre y
 * teselas libres de OpenFreeMap (sin clave ni facturación). La cartografía se
 * repinta con la paleta del sistema tonal (navy, azul profundo, cian) para que
 * sea parte del diseño y no un recuadro ajeno.
 *
 * El worker se sirve desde /public (variante CSP) porque la política del sitio
 * no permite `blob:` en script-src.
 */
export const NEXARA_COORDS: [number, number] = [-98.277838, 19.073803];
export const NEXARA_MAPS_LINK = "https://maps.app.goo.gl/uJBZyNeAApgAri536";
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const WORKER_URL = "/maplibre-gl-csp-worker.js";

const PALETTE = {
  bg: "#070f1e",
  land: "#0a1628",
  park: "#0b1f33",
  water: "#0b2440",
  building: "#122240",
  roadMinor: "#1a3050",
  roadMajor: "#274b74",
  roadCasing: "#08111f",
  rail: "#1b3350",
  boundary: "#2a3f5f",
  text: "#93a4bd",
  textHalo: "#070f1e",
};

let libPromise: Promise<MapLibreModule> | null = null;
/** Carga MapLibre solo cuando un mapa entra en escena: no pesa en el First Load de ninguna página. */
const loadMapLibre = (): Promise<MapLibreModule> => {
  if (!libPromise) {
    libPromise = import("maplibre-gl/dist/maplibre-gl-csp").then((mod) => {
      const lib = (mod.default ?? mod) as MapLibreModule;
      const cfg = lib as unknown as { setWorkerUrl?: (url: string) => void; workerUrl?: string };
      if (typeof cfg.setWorkerUrl === "function") cfg.setWorkerUrl(WORKER_URL);
      else cfg.workerUrl = WORKER_URL;
      return lib;
    });
  }
  return libPromise;
};

/** Repinta las capas del estilo base con la paleta del sitio. */
function restyle(map: MapLibreMap) {
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    const id = layer.id.toLowerCase();
    try {
      switch (layer.type) {
        case "background":
          map.setPaintProperty(layer.id, "background-color", PALETTE.bg);
          break;
        case "fill": {
          let color = PALETTE.land;
          if (/water|ocean|lake|river|sea/.test(id)) color = PALETTE.water;
          else if (/park|wood|forest|grass|green|cemetery|golf|landcover|pitch|garden/.test(id)) color = PALETTE.park;
          else if (/building/.test(id)) color = PALETTE.building;
          map.setPaintProperty(layer.id, "fill-color", color);
          map.setPaintProperty(layer.id, "fill-outline-color", color);
          break;
        }
        case "fill-extrusion":
          map.setPaintProperty(layer.id, "fill-extrusion-color", PALETTE.building);
          break;
        case "line": {
          let color = PALETTE.roadMinor;
          if (/casing|outline/.test(id)) color = PALETTE.roadCasing;
          else if (/minor|path|service|track|pier|taxiway|runway/.test(id)) color = PALETTE.roadMinor;
          else if (/motorway|trunk|primary|major/.test(id)) color = PALETTE.roadMajor;
          else if (/rail|transit/.test(id)) color = PALETTE.rail;
          else if (/boundary|admin/.test(id)) color = PALETTE.boundary;
          else if (/water|river|stream|canal/.test(id)) color = PALETTE.water;
          map.setPaintProperty(layer.id, "line-color", color);
          break;
        }
        case "symbol": {
          if (/poi|housenumber|housenum/.test(id)) {
            map.setLayoutProperty(layer.id, "visibility", "none");
            break;
          }
          map.setPaintProperty(layer.id, "text-color", PALETTE.text);
          map.setPaintProperty(layer.id, "text-halo-color", PALETTE.textHalo);
          map.setPaintProperty(layer.id, "text-halo-width", 1);
          map.setPaintProperty(layer.id, "icon-opacity", 0.55);
          break;
        }
        default:
          break;
      }
    } catch {
      /* capa sin esa propiedad: se ignora */
    }
  }
}

type BrandMapProps = {
  /** Versión reducida (footer): sin tarjeta ni controles, solo mapa y pin. */
  compact?: boolean;
  /** Muestra la tarjeta de dirección y el CTA sobre el mapa (false cuando el copy vive al lado). */
  overlay?: boolean;
  className?: string;
};

export default function BrandMap({ compact = false, overlay = true, className }: BrandMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"idle" | "ready" | "failed">("idle");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let map: MapLibreMap | null = null;
    let cancelled = false;
    let failTimer: ReturnType<typeof setTimeout> | null = null;

    let starting = false;
    const init = async () => {
      if (cancelled || map || starting) return;
      starting = true;
      try {
        const maplibregl = await loadMapLibre();
        if (cancelled) return;
        map = new maplibregl.Map({
          container: host,
          style: STYLE_URL,
          center: NEXARA_COORDS,
          zoom: compact ? 14.4 : 15.1,
          minZoom: 11,
          maxZoom: 18,
          attributionControl: { compact: true },
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        map.touchZoomRotate.disableRotation();
        if (!compact) {
          map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        }

        const pin = document.createElement("div");
        pin.className = styles.pin;
        pin.setAttribute("aria-label", "NEXARA · Explanada Puebla");
        const ring = document.createElement("span");
        ring.className = styles.pinRing;
        const dot = document.createElement("span");
        dot.className = styles.pinDot;
        pin.append(ring, dot);
        new maplibregl.Marker({ element: pin, anchor: "center" }).setLngLat(NEXARA_COORDS).addTo(map);

        map.on("error", (e: { error?: { message?: string } }) => {
          console.warn("[BrandMap] error de mapa:", e?.error?.message || e);
        });
        map.on("style.load", () => {
          if (map) restyle(map);
        });
        map.on("load", () => {
          if (failTimer) clearTimeout(failTimer);
          if (!cancelled) setState("ready");
        });
        failTimer = setTimeout(() => {
          if (!cancelled && !map?.loaded()) {
            console.warn("[BrandMap] el estilo no cargó a tiempo", { styleLoaded: map?.isStyleLoaded() });
            setState("failed");
          }
        }, 12000);
      } catch (err) {
        console.error("[BrandMap] no se pudo inicializar el mapa", err);
        setState("failed");
      }
    };

    // Red de seguridad: si el observer no dispara (layout tardío, iframes, etc.), inicia igual.
    const safety = setTimeout(() => void init(), 2500);

    // Inicializa solo cuando el mapa se acerca al viewport (no frena la carga).
    if (typeof IntersectionObserver === "undefined") {
      void init();
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            void init();
          }
        },
        { rootMargin: "320px 0px" },
      );
      io.observe(host);
      return () => {
        cancelled = true;
        io.disconnect();
        clearTimeout(safety);
        if (failTimer) clearTimeout(failTimer);
        map?.remove();
      };
    }

    return () => {
      cancelled = true;
      clearTimeout(safety);
      if (failTimer) clearTimeout(failTimer);
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  return (
    <div className={`${styles.mapContainer} ${compact ? styles.compact : ""} ${className || ""}`} data-map-state={state}>
      <div ref={hostRef} className={styles.brandMap} role="img" aria-label="Mapa de la base operativa de NEXARA en Explanada Puebla, Santiago Momoxpan" />

      {state === "failed" ? (
        <div className={styles.mapFallback}>
          <span className={styles.mapCardKicker}>Base operativa</span>
          <strong>Explanada Puebla · Santiago Momoxpan</strong>
          <span>San Pedro Cholula, Puebla</span>
        </div>
      ) : null}

      {!compact && overlay && state !== "failed" ? (
        <div className={styles.mapCard}>
          <span className={styles.mapCardKicker}>Base operativa</span>
          <strong className={styles.mapCardTitle}>NEXARA · Explanada Puebla</strong>
          <span className={styles.mapCardText}>Santiago Momoxpan, San Pedro Cholula, Puebla</span>
        </div>
      ) : null}

      {overlay || compact ? (
      <a
        className={`${styles.mapCta} ${compact ? styles.mapCtaCompact : ""}`}
        href={NEXARA_MAPS_LINK}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Cómo llegar a NEXARA (abre Google Maps)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        Cómo llegar
      </a>
      ) : null}
    </div>
  );
}
