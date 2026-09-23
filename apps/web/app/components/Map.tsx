"use client";
import React from "react";
import styles from "./Map.module.css";
import { useMapProvider } from "./useMapProvider";

const NEXARA_MAPS_LINK = "https://maps.app.goo.gl/34XSHPwUSeMAB7x69";

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
