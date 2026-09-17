"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./ClientLocationPicker.module.css";
import { useVisibleOnce } from "@/lib/use-visible-once";
import { googleMapsLink, staticMapUrl } from "@/lib/static-map";
import {
  DEBOUNCE_MS,
  MIN_QUERY_LENGTH,
  PlacesSearch,
  isQueryWorthSearching,
  normalizeQuery,
  parseCoordinateInput,
  type PlaceSuggestion,
} from "@/lib/places-autocomplete";

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

const toNumber = (value?: number | null) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Selector de ubicación de sucursal.
 *
 * Antes montaba un mapa interactivo completo —el SDK de Maps más una instancia
 * de `Map`, que es lo que Google factura como «Dynamic Map»— solo para enseñar
 * un pin que nadie podía arrastrar: el marcador no tenía ni `draggable` ni
 * manejador de clic. Y colgaba `places.Autocomplete` del input, que pide
 * predicciones en cada tecla.
 *
 * Ahora: campo de texto normal, vista previa como imagen estática cacheada por
 * nuestra API, y búsqueda de Places solo cuando el usuario la pide (≥4
 * caracteres, 400 ms de espera, México, sesión que se cierra al elegir). Quien
 * ya tiene el punto puede pegar coordenadas o un enlace de Google Maps: eso no
 * cuesta nada.
 */
export default function ClientLocationPicker({ label, value, onChange, height = 220 }: ClientLocationPickerProps) {
  const [previewRef, previewVisible] = useVisibleOnce<HTMLDivElement>();
  const searchRef = useRef<PlacesSearch | null>(null);
  const debounceRef = useRef<number | null>(null);
  const [inputValue, setInputValue] = useState(value.address || "");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  /** La búsqueda asistida no arranca sola: la enciende el usuario. */
  const [assistEnabled, setAssistEnabled] = useState(false);

  const lat = toNumber(value.latitud);
  const lng = toNumber(value.longitud);

  const previewUrl = useMemo(
    () => (previewVisible ? staticMapUrl(lat, lng, { zoom: 16, width: 600, height: 300 }) : ""),
    [previewVisible, lat, lng],
  );
  const mapsLink = useMemo(() => googleMapsLink(lat, lng), [lat, lng]);

  const getSearch = useCallback(() => {
    if (!searchRef.current) searchRef.current = new PlacesSearch();
    return searchRef.current;
  }, []);

  const runSearch = useCallback(async (query: string) => {
    if (!isQueryWorthSearching(query)) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    setStatus(null);
    try {
      setSuggestions(await getSearch().suggest(query));
    } catch (error) {
      setSuggestions([]);
      setStatus(error instanceof Error ? error.message : "No se pudo buscar la dirección");
    } finally {
      setSearching(false);
    }
  }, [getSearch]);

  const handleInput = (raw: string) => {
    setInputValue(raw);
    onChange({ ...value, address: raw });

    // Pegar coordenadas o un enlace de Maps resuelve el punto sin pedir nada.
    const coords = parseCoordinateInput(raw);
    if (coords) {
      setSuggestions([]);
      onChange({ ...value, address: raw, latitud: coords.lat, longitud: coords.lng });
      setStatus("Coordenadas leídas del texto");
      return;
    }

    if (!assistEnabled) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void runSearch(raw), DEBOUNCE_MS);
  };

  const handlePick = async (suggestion: PlaceSuggestion) => {
    setSuggestions([]);
    setSearching(true);
    try {
      const place = await getSearch().resolve(suggestion.id);
      if (!place) {
        setStatus("No se pudo obtener la ubicación del sitio elegido");
        return;
      }
      setInputValue(place.address || suggestion.label);
      onChange({
        address: place.address || suggestion.label,
        placeId: place.placeId,
        latitud: place.lat,
        longitud: place.lng,
      });
      setStatus("Ubicación actualizada");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo obtener la ubicación");
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    setInputValue(value.address || "");
  }, [value.address]);

  useEffect(() => () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    searchRef.current?.endSession();
  }, []);

  const tooShort = assistEnabled && normalizeQuery(inputValue).length > 0
    && normalizeQuery(inputValue).length < MIN_QUERY_LENGTH;

  return (
    <div className={styles.wrapper}>
      <label className={styles.label}>{label}</label>

      <div className={styles.searchRow}>
        <input
          className="input"
          placeholder="Dirección, o pega coordenadas / enlace de Google Maps"
          value={inputValue}
          onChange={(event) => handleInput(event.target.value)}
        />
        <button
          type="button"
          className={styles.searchButton}
          onClick={() => {
            if (assistEnabled) {
              setAssistEnabled(false);
              setSuggestions([]);
              searchRef.current?.endSession();
              return;
            }
            setAssistEnabled(true);
            void runSearch(inputValue);
          }}
          disabled={searching}
        >
          {assistEnabled ? "Dejar de buscar" : "Buscar en Google"}
        </button>
      </div>

      {tooShort && (
        <div className={styles.hint}>Escribe al menos {MIN_QUERY_LENGTH} caracteres para buscar.</div>
      )}

      {suggestions.length > 0 && (
        <ul className={styles.suggestions}>
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button type="button" className={styles.suggestion} onClick={() => void handlePick(suggestion)}>
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div ref={previewRef} style={{ minHeight: height }}>
        {previewUrl ? (
          <a href={mapsLink || previewUrl} target="_blank" rel="noopener noreferrer">
            <img
              className={styles.previewImage}
              src={previewUrl}
              alt="Ubicación seleccionada"
              loading="lazy"
              style={{ maxHeight: height }}
            />
          </a>
        ) : (
          <div className={styles.previewPlaceholder} style={{ minHeight: height }}>
            {lat !== null && lng !== null
              ? "Cargando vista previa…"
              : "Sin ubicación: busca la dirección o pega las coordenadas."}
          </div>
        )}
      </div>

      {lat !== null && lng !== null && (
        <div className={styles.hint}>
          {lat.toFixed(5)}, {lng.toFixed(5)}
          {mapsLink && (
            <>
              {" · "}
              <a href={mapsLink} target="_blank" rel="noopener noreferrer">Abrir en Google Maps</a>
            </>
          )}
        </div>
      )}

      {status && <div className={styles.status}>{status}</div>}
    </div>
  );
}
