"use client";
import React, { useEffect, useRef, useState } from "react";
import styles from "./Map.module.css";

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
  Map: new (element: HTMLDivElement, options: GoogleMapsOptions) => unknown;
  Marker: new (options: GoogleMarkerOptions) => unknown;
  InfoWindow: new (options: GoogleInfoWindowOptions) => unknown;
  Animation: { DROP: number };
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

    const initMapCallback = () => {
      try {
        if (!window.google?.maps) {
          setError("Google Maps API no disponible");
          return;
        }
        if (!mapRef.current) return;

        const location = { lat: 19.073802875589788, lng: -98.2778382565653 };
        const mapElement = mapRef.current;
        mapInstance.current = new window.google.maps.Map(mapElement, {
          zoom: 18,
          center: location,
          mapTypeControl: true,
          fullscreenControl: true,
          streetViewControl: true,
          zoomControl: true,
        });

        const currentMap = mapInstance.current;
        const mapsAny = window.google.maps as any;
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

        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div style="font-family: Arial, sans-serif; text-align: center; padding: 10px; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); max-width: 220px;">
              <img src="/logo-nexara.png" alt="NEXARA" style="width:32px;height:32px;object-fit:contain;margin-bottom:8px;" />
              <h3 style="margin:0 0 8px 0; font-size:15px; font-weight:700; color:#1e293b;">NEXARA</h3>
              <a href="https://maps.app.goo.gl/34XSHPwUSeMAB7x69" target="_blank" rel="noopener" style="display:inline-block;padding:7px 14px;border-radius:6px;text-decoration:none;color:#fff;font-size:13px;font-weight:600;background:#2563eb;box-shadow:0 1px 4px rgba(37,99,235,0.18);margin-top:6px;">🗺️ Cómo llegar</a>
            </div>
          `,
        });

        (marker as unknown as { addListener: (event: string, handler: () => void) => void }).addListener("click", () => {
          (infoWindow as unknown as { open: (options: { anchor: unknown, map: unknown }) => void }).open({
            anchor: marker as unknown,
            map: currentMap,
          });
        });

        (infoWindow as unknown as { open: (options: { anchor: unknown, map: unknown }) => void }).open({
          anchor: marker as unknown,
          map: currentMap,
        });
      } catch (err) {
        console.error("Error al inicializar el mapa:", err);
        setError("Error al cargar el mapa");
      }
    };

    if (window.google?.maps) {
      initMapCallback();
      return;
    }

    // Evita cargar el script de Google Maps más de una vez
    const existingScript = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyDOJ7TFUE5F1vD_qVh9ofKOSS5gd2mbnyE&v=weekly&libraries=marker`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        // Espera un breve momento para asegurar que google.maps esté completamente inicializado
        setTimeout(() => {
          if (window.google?.maps) {
            initMapCallback();
          } else {
            setError("Google Maps no se inicializó correctamente");
          }
        }, 100);
      };
      script.onerror = () => {
        setError("Error al cargar Google Maps API");
      };
      document.head.appendChild(script);
    } else {
      // Si el script ya existe, espera a que google.maps esté disponible
      const checkGoogleMaps = setInterval(() => {
        if (window.google?.maps) {
          clearInterval(checkGoogleMaps);
          initMapCallback();
        }
      }, 100);
      
      // Timeout después de 10 segundos
      setTimeout(() => {
        clearInterval(checkGoogleMaps);
        if (!window.google?.maps) {
          setError("Timeout esperando Google Maps API");
        }
      }, 10000);
    }

    return () => {
      delete window.initMap;
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