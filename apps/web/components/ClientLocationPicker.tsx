"use client";
import React, { useEffect, useRef, useState } from "react";
import styles from "./ClientLocationPicker.module.css";

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-script";

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

  const injectScript = () =>
    new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.id = GOOGLE_MAPS_SCRIPT_ID;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&libraries=places,marker&loading=async`;
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
      script.onerror = () => reject(new Error("Error al cargar Google Maps"));
      document.body.appendChild(script);
    });

  const removeExistingScript = () => {
    const stale = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    stale?.parentElement?.removeChild(stale);
  };

  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (existing) {
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

      existing.addEventListener("error", () => {
        window.clearInterval(checkGoogle);
        removeExistingScript();
        injectScript().then(resolve).catch(reject);
      }, { once: true });
      return;
    }
    injectScript().then(resolve).catch(reject);
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

const resolveMapCtor = async (mapsApi: any) => {
  if (typeof mapsApi?.Map === "function") return mapsApi.Map;
  if (typeof mapsApi?.importLibrary === "function") {
    const mapsLibrary = await mapsApi.importLibrary("maps");
    if (typeof mapsLibrary?.Map === "function") return mapsLibrary.Map;
  }
  return null;
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
        let mapCtor: any = null;
        for (let attempt = 0; attempt < 25; attempt += 1) {
          mapCtor = await resolveMapCtor(google.maps);
          if (mapCtor) break;
          await new Promise((resolve) => window.setTimeout(resolve, 120));
        }
        if (!mapCtor) {
          setStatus("Google Maps Map constructor no disponible.");
          return;
        }
        const center = {
          lat: toNumber(value.latitud) || 19.4326,
          lng: toNumber(value.longitud) || -99.1332,
        };
        mapInstance.current = new mapCtor(mapRef.current, {
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
            setStatus("Ubicación actualizada");
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

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.style.height = `${height}px`;
  }, [height]);

  return (
    <div className={styles.wrapper}>
      <label className={styles.label}>{label}</label>
      <input
        ref={inputRef}
        className="input"
        placeholder="Busca la ubicación en Google Maps"
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
      />
      <div ref={mapRef} className={styles.mapContainer} />
      {status && <div className={styles.status}>{status}</div>}
    </div>
  );
}

