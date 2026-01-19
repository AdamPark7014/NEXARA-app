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
        const marker = new window.google.maps.Marker({
          position: location,
          map: currentMap,
          title: "NEXARA",
          animation: window.google.maps.Animation.DROP,
        });

        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div class="map-info-window" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              <img class="map-info-logo" src="/logo-nexara.png" alt="NEXARA" />
              <h3 class="map-info-title">NEXARA</h3>
              <a class="map-info-button" href="https://maps.app.goo.gl/34XSHPwUSeMAB7x69" target="_blank" rel="noopener">
                🗺️ Cómo llegar
              </a>
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

    window.initMap = initMapCallback;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyDOJ7TFUE5F1vD_qVh9ofKOSS5gd2mbnyE&callback=initMap`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      setError("Error al cargar Google Maps API");
    };
    document.head.appendChild(script);

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