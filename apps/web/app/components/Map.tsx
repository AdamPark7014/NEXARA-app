"use client";
import React, { useEffect, useRef, useState } from "react";
import styles from "./Map.module.css";

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-script";
const GOOGLE_MAPS_API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyDOJ7TFUE5F1vD_qVh9ofKOSS5gd2mbnyE";

// Tipos para Google Maps
interface GoogleMapsOptions {
  zoom: number;
  center: { lat: number; lng: number };
  mapTypeControl: boolean;
  fullscreenControl: boolean;
  streetViewControl: boolean;
  zoomControl: boolean;
}
interface GoogleMarkerOptions {
  position: { lat: number; lng: number };
  map: unknown;
  title?: string;
  animation?: number;
}
interface GoogleInfoWindowOptions {
  content: string;
}
interface GoogleMapsAPI {
  Map?: new (element: HTMLDivElement, options: GoogleMapsOptions) => unknown;
  Marker: new (options: GoogleMarkerOptions) => unknown;
  InfoWindow: new (options: GoogleInfoWindowOptions) => unknown;
  Animation: { DROP: number };
  importLibrary?: (library: string) => Promise<{ Map?: new (element: HTMLDivElement, options: GoogleMapsOptions) => unknown }>;
  marker?: {
    AdvancedMarkerElement?: new (options: GoogleMarkerOptions) => unknown;
  };
}

declare global {
  interface Window {
    google?: {
      maps: GoogleMapsAPI;
    };
    initMap?: () => void;
  }
}

export default function Map() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mapInstance.current || typeof window === "undefined") return;

    const loadGoogleMapsScript = () => {
      if (window.google?.maps) return Promise.resolve();
      if (!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error("API key no configurada"));

      const injectScript = () =>
        new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.id = GOOGLE_MAPS_SCRIPT_ID;
          script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&v=weekly&libraries=places,marker&loading=async`;
          script.async = true;
          script.defer = true;
          script.onload = () => {
            window.setTimeout(() => {
              if (window.google?.maps) {
                resolve();
              } else {
                reject(new Error("Google Maps no se inicializó correctamente"));
              }
            }, 120);
          };
          script.onerror = () => reject(new Error("Error al cargar Google Maps API"));
          document.head.appendChild(script);
        });

      const removeExistingScript = () => {
        const stale = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
        stale?.parentElement?.removeChild(stale);
      };

      return new Promise<void>((resolve, reject) => {
        const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;

        if (existingScript) {
          if (window.google?.maps) {
            resolve();
            return;
          }

          const start = Date.now();
          const checkGoogle = window.setInterval(() => {
            if (window.google?.maps) {
              window.clearInterval(checkGoogle);
              resolve();
              return;
            }

            if (Date.now() - start > 12000) {
              window.clearInterval(checkGoogle);
              removeExistingScript();
              injectScript().then(resolve).catch(reject);
            }
          }, 120);

          existingScript.addEventListener("error", () => {
            window.clearInterval(checkGoogle);
            removeExistingScript();
            injectScript().then(resolve).catch(reject);
          }, { once: true });

          return;
        }

        injectScript().then(resolve).catch(reject);
      });
    };

    const resolveMapConstructor = async (maps: GoogleMapsAPI) => {
      if (typeof maps.Map === "function") return maps.Map;
      if (typeof maps.importLibrary === "function") {
        const mapsLibrary = await maps.importLibrary("maps");
        if (typeof mapsLibrary?.Map === "function") return mapsLibrary.Map;
      }
      return null;
    };

    const waitForMapConstructor = async (maps: GoogleMapsAPI) => {
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const MapConstructor = await resolveMapConstructor(maps);
        if (MapConstructor) return MapConstructor;
        await new Promise((r) => window.setTimeout(r, 120));
      }
      return null;
    };

    let cancelled = false;
    const initializeMap = async () => {
      try {
        await loadGoogleMapsScript();
        if (cancelled || !mapRef.current) return;

        const maps = window.google?.maps;
        if (!maps) {
          setError("Google Maps API no disponible");
          return;
        }

        const MapConstructor = await waitForMapConstructor(maps);
        if (!MapConstructor) {
          throw new Error("Google Maps Map no disponible");
        }

        if (typeof maps.importLibrary === "function" && !maps.marker?.AdvancedMarkerElement) {
          await maps.importLibrary("marker");
        }

        const location = { lat: 19.073802875589788, lng: -98.2778382565653 };
        mapInstance.current = new MapConstructor(mapRef.current, {
          zoom: 18,
          center: location,
          mapTypeControl: true,
          fullscreenControl: true,
          streetViewControl: true,
          zoomControl: true,
        });

        const currentMap = mapInstance.current;
        const mapsAny = window.google?.maps as any;
        const marker = mapsAny?.marker?.AdvancedMarkerElement
          ? new mapsAny.marker.AdvancedMarkerElement({
              position: location,
              map: currentMap,
              title: "NEXARA",
            })
          : new mapsAny.Marker({
              position: location,
              map: currentMap,
              title: "NEXARA",
              animation: mapsAny.Animation?.DROP,
            });

        const infoWindow = new mapsAny.InfoWindow({
          content: `
            <div style="font-family: Arial, sans-serif; text-align: center; padding: 10px; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); max-width: 220px;">
              <img src="/logo-nexara.png" alt="NEXARA" style="width:32px;height:32px;object-fit:contain;margin-bottom:8px;" />
              <h3 style="margin:0 0 8px 0; font-size:15px; font-weight:700; color:#1e293b;">NEXARA</h3>
              <a href="https://maps.app.goo.gl/34XSHPwUSeMAB7x69" target="_blank" rel="noopener" style="display:inline-block;padding:7px 14px;border-radius:6px;text-decoration:none;color:#fff;font-size:13px;font-weight:600;background:#2563eb;box-shadow:0 1px 4px rgba(37,99,235,0.18);margin-top:6px;">🗺️ Cómo llegar</a>
            </div>
          `,
        });

        (marker as { addListener?: (event: string, handler: () => void) => void }).addListener?.("click", () => {
          (infoWindow as { open: (options: { anchor: unknown; map: unknown }) => void }).open({
            anchor: marker,
            map: currentMap,
          });
        });

        (infoWindow as { open: (options: { anchor: unknown; map: unknown }) => void }).open({
          anchor: marker,
          map: currentMap,
        });
      } catch (err) {
        console.error("Error al inicializar el mapa:", err);
        setError("Error al cargar el mapa");
      }
    };

    void initializeMap();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className={styles.mapContainer}>
        <div className={styles.mapError}>
          <p>{error}</p>
          <p style={{ fontSize: "0.85rem", marginTop: "8px", opacity: 0.7 }}>
            Verifica que tu API key esté habilitada y configurada en Google Cloud Console
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.mapContainer}>
      <div className={styles.mapWrapper} ref={mapRef} />
    </div>
  );
}