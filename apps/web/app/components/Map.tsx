"use client";
import React, { useMemo } from "react";
import styles from "./Map.module.css";
import { googleMapsApiKey } from "@/lib/google-maps-loader";

const PLACE_QUERY = "Explanada Puebla, Santiago Momoxpan, Puebla";
const NEXARA_MAPS_LINK = "https://maps.app.goo.gl/34XSHPwUSeMAB7x69";

/**
 * Contact map — embed via Maps Embed API when API key is available,
 * else fall back to classic `maps?q=...&output=embed` (no secret in repo).
 * Always shows a live embed; the secondary "Abrir en Google Maps" lives fuera.
 */
export default function Map() {
  const src = useMemo(() => {
    const key = googleMapsApiKey();
    const q = encodeURIComponent(PLACE_QUERY);
    if (key) {
      // Maps Embed API — place search
      return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${q}&zoom=15&language=es`;
    }
    // Fallback embed without key
    return `https://maps.google.com/maps?q=${q}&output=embed&hl=es`;
  }, []);

  return (
    <div className={styles.mapContainer}>
      <div className={styles.mapWrapper}>
        <iframe
          title="Mapa NEXARA — Explanada Puebla, Momoxpan"
          src={src}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          aria-label="Ubicación NEXARA en Google Maps"
        />
      </div>
      {/* Secondary link remains available for users wanting the full app */}
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
