"use client";
import React from "react";
import styles from "./Map.module.css";
import { useMapProvider } from "./useMapProvider";

const NEXARA_MAPS_LINK = "https://maps.app.goo.gl/uJBZyNeAApgAri536";

/**
 * Mapa de Contacto — iframe embebido.
 * El proveedor lo decide `/mapa/proveedor`: Google Maps Embed cuando la clave
 * tiene esa API habilitada; si no, OpenStreetMap (sin clave). Así el mapa
 * siempre se ve, y el enlace a Google Maps queda como acción secundaria.
 */
export default function Map() {
  const info = useMapProvider();

  return (
    <div className={styles.mapContainer}>
      <div className={styles.mapWrapper}>
        {info ? (
          <iframe
            key={info.provider}
            data-provider={info.provider}
            title="Mapa NEXARA — Explanada Puebla, Momoxpan"
            src={info.src}
            width="100%"
            height="100%"
            style={{ border: 0, display: "block", width: "100%", height: "100%" }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            aria-label="Ubicación NEXARA en el mapa"
          />
        ) : (
          <div className={styles.mapPlaceholder} aria-hidden>
            Cargando mapa…
          </div>
        )}
      </div>
      <a
        className={styles.mapCta}
        href={info?.link || NEXARA_MAPS_LINK}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Cómo llegar a NEXARA (abre Google Maps)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
        Cómo llegar
      </a>
      <noscript>
        <p>
          Ver ubicación en{" "}
          <a href={NEXARA_MAPS_LINK} target="_blank" rel="noopener noreferrer">
            Google Maps
          </a>
        </p>
      </noscript>
    </div>
  );
}
