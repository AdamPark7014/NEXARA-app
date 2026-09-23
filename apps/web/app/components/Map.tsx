"use client";
import React, { useEffect, useRef, useState } from "react";
import styles from "./Map.module.css";
import { googleMapsMapId, isGoogleMapsConfigured, loadGoogleMaps, loadMapConstructor } from "@/lib/google-maps-loader";

const NEXARA_LOCATION = { lat: 19.073802875589788, lng: -98.2778382565653 };
const NEXARA_MAPS_LINK =
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent(
    "Calle Ignacio Allende 512, Santiago Momoxpan — Auditorio Explanada Puebla, 72774 San Pedro Cholula, Pue."
  );

const NEXARA_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#07111f" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9bb0cc" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#050a14" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#1a2a40" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#0a1628" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#0d1a2e" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#0c1f2a" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a2f48" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#243a55" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2a4560" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1a3048" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#132438" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a2038" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#6f85a5" }] },
] as const;

/**
 * Mapa de la página de contacto.
 *
 * Se montaba con la página: cada visita al sitio público —incluidos los robots
 * y quien solo venía por el teléfono— instanciaba un mapa, que es justo lo que
 * Google cobra como «Dynamic Maps», y de paso cargaba la librería Places que
 * esta pantalla no usa para nada.
 *
 * Ahora la visita ve una tarjeta con la dirección y el enlace a Maps (gratis);
 * el mapa interactivo solo se crea si alguien pulsa «Ver mapa».
 */
export default function Map() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || mapInstance.current || typeof window === "undefined") return;

    let cancelled = false;
    const initializeMap = async () => {
      try {
        // `marker` sí; `places` no: aquí no se busca ninguna dirección.
        const MapConstructor = await loadMapConstructor();
        await loadGoogleMaps(["marker"]);
        if (cancelled || !mapRef.current) return;

        const mapId = googleMapsMapId();
        mapInstance.current = new MapConstructor(mapRef.current, {
          zoom: 16,
          center: NEXARA_LOCATION,
          ...(mapId ? { mapId } : { styles: NEXARA_MAP_STYLES }),
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
          zoomControl: true,
        });

        const currentMap = mapInstance.current;
        const mapsAny = window.google?.maps as any;
        const canUseAdvancedMarker = Boolean(mapId && mapsAny?.marker?.AdvancedMarkerElement);
        const marker = canUseAdvancedMarker
          ? new mapsAny.marker.AdvancedMarkerElement({
              position: NEXARA_LOCATION,
              map: currentMap,
              title: "NEXARA",
            })
          : new mapsAny.Marker({
              position: NEXARA_LOCATION,
              map: currentMap,
              title: "NEXARA",
              animation: mapsAny.Animation?.DROP,
            });

        const infoWindow = new mapsAny.InfoWindow({
          content: `
            <div class="nexara-map-info">
              <img src="/logo-nexara-lockup.png" alt="NEXARA" class="nexara-map-logo" />
              <h3 class="nexara-map-title">NEXARA</h3>
              <p class="nexara-map-subtitle">Auditorio Explanada Puebla · Momoxpan</p>
              <button type="button" class="nexara-map-btn" onclick="window.open('${NEXARA_MAPS_LINK}','_blank','noopener')">
                Ver ubicación
              </button>
            </div>
          `,
          maxWidth: 260,
        });

        const openInfoWindow = () => {
          (infoWindow as { open: (options: { anchor: unknown; map: unknown }) => void }).open({
            anchor: marker,
            map: currentMap,
          });
        };

        if (canUseAdvancedMarker && typeof (marker as { addEventListener?: (eventName: string, listener: () => void) => void }).addEventListener === "function") {
          (marker as { addEventListener: (eventName: string, listener: () => void) => void }).addEventListener("gmp-click", openInfoWindow);
        } else {
          (marker as { addListener?: (event: string, handler: () => void) => void }).addListener?.("click", openInfoWindow);
        }

        openInfoWindow();
      } catch (err) {
        console.error("Error al inicializar el mapa:", err);
        setError("Error al cargar el mapa");
      }
    };

    void initializeMap();

    return () => {
      cancelled = true;
    };
  }, [active]);

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

  if (!active) {
    return (
      <div className={styles.mapContainer}>
        <div className={styles.mapPlaceholder}>
          <p style={{ margin: 0, fontWeight: 600, color: "#eef4ff" }}>NEXARA</p>
          <p style={{ margin: "4px 0 14px" }}>Auditorio Explanada Puebla · Momoxpan</p>
          {isGoogleMapsConfigured() ? (
            <button type="button" className="nexara-map-btn" onClick={() => setActive(true)}>
              Ver mapa
            </button>
          ) : (
            <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>Mapa no disponible.</p>
          )}
          <p style={{ marginTop: 12, fontSize: "0.8rem" }}>
            <a href={NEXARA_MAPS_LINK} target="_blank" rel="noopener noreferrer" style={{ color: "#2dd8f2" }}>
              Abrir en Google Maps
            </a>
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
