"use client";
import React, { useEffect, useRef, useState } from "react";

export type ClientLocationValue = {
  address?: string;
  placeId?: string;
  latitud?: number | null;
  longitud?: number | null;
};

type ClientLocationPickerProps = {
  label: string;
  value: ClientLocationValue;
  onChange: (value: ClientLocationValue) => void;
  height?: number;
};

const loadGoogleMaps = (apiKey: string) => {
  if (!apiKey) return Promise.reject(new Error("API key no configurada"));
  if (window.google?.maps) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("google-maps-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Error al cargar Google Maps")));
      return;
    }
    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&libraries=places,marker`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      // Espera a que google.maps esté completamente inicializado
      setTimeout(() => {
        if (window.google?.maps) {
          resolve();
        } else {
          reject(new Error("Google Maps no se inicializó correctamente"));
        }
      }, 100);
    };
    script.onerror = () => reject(new Error("Error al cargar Google Maps"));
    document.body.appendChild(script);
  });
};

const ensurePlacesLibrary = async () => {
  if (!window.google?.maps) throw new Error("Google Maps no disponible");
  const google = window.google as any;
  if (google.maps.places) return;
  if (typeof google.maps.importLibrary === "function") {
    await google.maps.importLibrary("places");
  }
};

const toNumber = (value?: number | null) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const createMapMarker = (googleMaps: any, map: any, position: { lat: number; lng: number }) => {
  return new googleMaps.Marker({
    map,
    position,
  });
};

const setMapMarkerPosition = (marker: any, position: { lat: number; lng: number }) => {
  if (!marker) return;
  if (typeof marker.setPosition === "function") {
    marker.setPosition(position);
    return;
  }
  marker.position = position;
};

export default function ClientLocationPicker({ label, value, onChange, height = 220 }: ClientLocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapInstance = useRef<any>(null);
  const markerInstance = useRef<any>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState(value.address || "");

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  useEffect(() => {
    let isActive = true;
    if (!apiKey) return undefined;
    loadGoogleMaps(apiKey)
      .then(async () => {
        if (!isActive || !mapRef.current || !window.google?.maps) return;
        const google = window.google as any;
        const center = {
          lat: toNumber(value.latitud) || 19.4326,
          lng: toNumber(value.longitud) || -99.1332,
        };
        mapInstance.current = new google.maps.Map(mapRef.current, {
          center,
          zoom: 13,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
        });
        markerInstance.current = createMapMarker(google.maps, mapInstance.current, center);

        await ensurePlacesLibrary();
        if (!google.maps?.places) {
          setStatus("Google Places no disponible.");
          return;
        }

        if (inputRef.current) {
          const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
            fields: ["formatted_address", "geometry", "place_id"],
            types: ["geocode"],
          });
          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            if (!place?.geometry?.location) return;
            const next = {
              address: place.formatted_address,
              placeId: place.place_id,
              latitud: place.geometry.location.lat(),
              longitud: place.geometry.location.lng(),
            };
            onChange(next);
            setMapMarkerPosition(markerInstance.current, {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            });
            mapInstance.current?.setCenter(place.geometry.location);
            setStatus("Ubicacion actualizada");
          });
        }
      })
      .catch((err) => setStatus(err.message));

    return () => {
      isActive = false;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!mapInstance.current || !markerInstance.current) return;
    const lat = toNumber(value.latitud);
    const lng = toNumber(value.longitud);
    if (lat === null || lng === null) return;
    const pos = { lat, lng };
    setMapMarkerPosition(markerInstance.current, pos);
    mapInstance.current.setCenter(pos);
  }, [value.latitud, value.longitud]);

  useEffect(() => {
    setInputValue(value.address || "");
  }, [value.address]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</label>
      <input
        ref={inputRef}
        className="input"
        placeholder="Busca la ubicacion en Google Maps"
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
      />
      <div ref={mapRef} style={{ height, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(15, 106, 214, 0.2)" }} />
      {status && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{status}</div>}
    </div>
  );
}
