"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- el SDK de Google Maps se carga en runtime */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import { formatApiError } from "@/lib/erp-api";
import {
  googleMapsMapId,
  isGoogleMapsConfigured,
  loadGoogleMaps,
  loadMapConstructor,
} from "@/lib/google-maps-loader";
import { useVisibleOnce } from "@/lib/use-visible-once";
import {
  fechaHoyIso,
  formatoHora,
  posicionesGps,
  recorridoGps,
  type PosicionVehiculo,
  type PosicionesGps,
  type RecorridoGps,
} from "@/lib/vehiculos-api";
import styles from "@/app/(panels)/erp/vehiculos/vehiculos-core.module.css";

/**
 * Mapa de la flotilla: dónde está cada unidad y, al elegir una y un día, por
 * dónde anduvo.
 *
 * Reglas de costo: cargar el SDK no se factura, instanciar el mapa sí. Por eso
 * el `new Map(...)` espera a que el hueco se vea (`useVisibleOnce`) y a que haya
 * algo que pintar. El sondeo de posiciones no baja de 60 s.
 */

const INTERVALO_MS = 60_000;

export default function VehiculosFlotaMapa({ token }: { token: string }) {
  const [datos, setDatos] = useState<PosicionesGps>({ demo: false, proveedor: "", posiciones: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [fecha, setFecha] = useState<string>(() => fechaHoyIso());
  const [recorrido, setRecorrido] = useState<RecorridoGps | null>(null);
  const [cargandoRecorrido, setCargandoRecorrido] = useState(false);

  const canUseMaps = useMemo(() => isGoogleMapsConfigured(), []);
  const mapId = googleMapsMapId();

  const [mapaRef, mapaVisible] = useVisibleOnce<HTMLDivElement>({
    enabled: canUseMaps && datos.posiciones.length > 0,
  });

  const mapaRefInterno = useRef<any>(null);
  const ctorRef = useRef<any>(null);
  const markerLibRef = useRef<{ AdvancedMarkerElement?: new (opts: object) => any } | null>(null);
  const marcadoresRef = useRef<Map<number, any>>(new Map());
  const rutaRef = useRef<any>(null);
  const [mapaListo, setMapaListo] = useState(false);

  /* ── Datos ───────────────────────────────────────────────────────── */

  const cargarPosiciones = useCallback(async () => {
    if (!token) return;
    try {
      setDatos(await posicionesGps(token));
      setError(null);
    } catch (e) {
      setError(formatApiError(e, "No se pudo leer el GPS"));
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargarPosiciones();
    // Nunca más seguido que un minuto: el proveedor cobra por consulta.
    const id = window.setInterval(() => void cargarPosiciones(), INTERVALO_MS);
    return () => window.clearInterval(id);
  }, [cargarPosiciones]);

  useEffect(() => {
    if (!token || seleccion === null) {
      setRecorrido(null);
      return;
    }
    let vivo = true;
    setCargandoRecorrido(true);
    void (async () => {
      try {
        const data = await recorridoGps(token, seleccion, fecha);
        if (vivo) setRecorrido(data);
      } catch (e) {
        if (vivo) {
          setRecorrido(null);
          setError(formatApiError(e, "No se pudo leer el recorrido"));
        }
      } finally {
        if (vivo) setCargandoRecorrido(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [token, seleccion, fecha]);

  /* ── Mapa ────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!mapaVisible) return;
    let cancelado = false;
    loadMapConstructor()
      .then(async (ctor) => {
        if (cancelado) return;
        markerLibRef.current = null;
        if (mapId) {
          try {
            const maps = await loadGoogleMaps(["marker"]);
            markerLibRef.current = (maps["marker"] as typeof markerLibRef.current) ?? null;
          } catch {
            markerLibRef.current = null;
          }
        }
        if (cancelado) return;
        ctorRef.current = ctor;
        setMapaListo(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar el mapa"));
    return () => {
      cancelado = true;
    };
  }, [mapaVisible, mapId]);

  useEffect(() => {
    if (!mapaListo || !mapaVisible || mapaRefInterno.current) return;
    const ctor = ctorRef.current;
    const nodo = mapaRef.current;
    if (typeof ctor !== "function" || !nodo) return;
    const usaAvanzados = Boolean(mapId && markerLibRef.current?.AdvancedMarkerElement);
    try {
      mapaRefInterno.current = new ctor(nodo, {
        center: { lat: 19.0414, lng: -98.2063 },
        zoom: 11,
        ...(usaAvanzados ? { mapId } : {}),
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
      });
    } catch {
      setMapaListo(false);
      setError("No se pudo crear el mapa");
    }
  }, [mapaListo, mapaVisible, mapId, mapaRef]);

  useEffect(
    () => () => {
      marcadoresRef.current.forEach((m) => quitarDelMapa(m));
      marcadoresRef.current.clear();
      if (rutaRef.current) quitarDelMapa(rutaRef.current);
      rutaRef.current = null;
      mapaRefInterno.current = null;
      ctorRef.current = null;
      markerLibRef.current = null;
    },
    [],
  );

  // Marcadores: uno por vehículo, reposicionados en cada sondeo.
  useEffect(() => {
    const mapa = mapaRefInterno.current;
    if (!mapa || !(window as any).google?.maps) return;
    const vivos = new Set<number>();
    const puntos: { lat: number; lng: number }[] = [];

    datos.posiciones.forEach((p) => {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
      const pos = { lat: p.lat, lng: p.lng };
      puntos.push(pos);
      vivos.add(p.vehicleAssetId);
      const existente = marcadoresRef.current.get(p.vehicleAssetId);
      if (existente) {
        moverMarcador(existente, pos);
        return;
      }
      const marcador = crearMarcador(mapa, pos, p.nombre, mapId, markerLibRef.current);
      if (!marcador) return;
      try {
        marcador.addListener?.("click", () => setSeleccion(p.vehicleAssetId));
      } catch {
        /* AdvancedMarkerElement viejo sin addListener */
      }
      marcadoresRef.current.set(p.vehicleAssetId, marcador);
    });

    marcadoresRef.current.forEach((marcador, id) => {
      if (!vivos.has(id)) {
        quitarDelMapa(marcador);
        marcadoresRef.current.delete(id);
      }
    });

    if (puntos.length === 0 || recorrido?.puntos.length) return;
    ajustar(mapa, puntos);
  }, [datos.posiciones, mapId, recorrido]);

  // Recorrido del día: una sola polilínea, se reemplaza al cambiar de vehículo.
  useEffect(() => {
    const mapa = mapaRefInterno.current;
    const maps = (window as any).google?.maps;
    if (!mapa || !maps) return;
    if (rutaRef.current) {
      quitarDelMapa(rutaRef.current);
      rutaRef.current = null;
    }
    const puntos = recorrido?.puntos ?? [];
    if (puntos.length < 2) return;
    const path = puntos.map((p) => ({ lat: p.lat, lng: p.lng }));
    try {
      rutaRef.current = new maps.Polyline({
        map: mapa,
        path,
        strokeColor: "#2563eb",
        strokeOpacity: 0.9,
        strokeWeight: 4,
      });
      ajustar(mapa, path);
    } catch {
      rutaRef.current = null;
    }
  }, [recorrido]);

  /* ── Render ──────────────────────────────────────────────────────── */

  const seleccionado = datos.posiciones.find((p) => p.vehicleAssetId === seleccion) ?? null;

  return (
    <div>
      <div className={styles.gpsBarra}>
        {datos.demo && <span className={styles.demo}>Datos de demostración</span>}
        <label className={styles.mini} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          Día
          <input
            type="date"
            className={styles.input}
            style={{ width: "auto", padding: "5px 8px" }}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            aria-label="Día del recorrido"
          />
        </label>
        {seleccionado && (
          <span className={styles.mini}>
            {seleccionado.nombre}
            {cargandoRecorrido
              ? " · cargando…"
              : recorrido
                ? ` · ${recorrido.kmAprox.toFixed(1)} km · ${recorrido.puntos.length} puntos`
                : ""}
          </span>
        )}
        {seleccion !== null && (
          <Button size="sm" variant="ghost" onClick={() => setSeleccion(null)}>
            Quitar recorrido
          </Button>
        )}
      </div>

      {error && <InlineAlert message={error} variant="danger" onDismiss={() => setError(null)} />}

      <div className={styles.gpsLayout}>
        <div ref={mapaRef} className={styles.mapa}>
          {!canUseMaps && (
            <span className={styles.mapaAviso}>El mapa necesita la clave de Google Maps.</span>
          )}
          {canUseMaps && datos.posiciones.length === 0 && (
            <span className={styles.mapaAviso}>
              {cargando ? "Cargando…" : "Ninguna unidad reporta posición."}
            </span>
          )}
          {canUseMaps && datos.posiciones.length > 0 && !mapaVisible && (
            <span className={styles.mapaAviso}>Desliza hasta aquí para cargar el mapa.</span>
          )}
        </div>

        <div className={styles.gpsLista}>
          {datos.posiciones.length === 0 && !cargando && (
            <EmptyState title="Sin unidades" variant="compact" />
          )}
          {datos.posiciones.map((p) => (
            <ItemVehiculo
              key={p.vehicleAssetId}
              posicion={p}
              activo={p.vehicleAssetId === seleccion}
              onClick={() => setSeleccion(p.vehicleAssetId === seleccion ? null : p.vehicleAssetId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ItemVehiculo({
  posicion,
  activo,
  onClick,
}: {
  posicion: PosicionVehiculo;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.gpsItem} ${activo ? styles.gpsItemActivo : ""}`}
      aria-pressed={activo}
      onClick={onClick}
    >
      <span className={styles.nombre}>{posicion.nombre}</span>
      <span className={styles.mini}>
        {posicion.conductor?.nombre ?? "Sin conductor"}
        {posicion.placas ? ` · ${posicion.placas}` : ""}
      </span>
      <span className={styles.mini}>
        {posicion.velocidadKmh !== null ? `${Math.round(posicion.velocidadKmh)} km/h` : "—"} ·{" "}
        {formatoHora(posicion.at)}
      </span>
    </button>
  );
}

/* ── Utilidades del SDK ─────────────────────────────────────────────── */

function crearMarcador(
  mapa: any,
  position: { lat: number; lng: number },
  titulo: string,
  mapId: string,
  lib: { AdvancedMarkerElement?: new (opts: object) => any } | null,
): any {
  const maps = (window as any).google?.maps;
  if (!maps) return null;
  const Avanzado = lib?.AdvancedMarkerElement;
  if (mapId && Avanzado) return new Avanzado({ map: mapa, position, title: titulo });
  return new maps.Marker({ map: mapa, position, title: titulo });
}

function moverMarcador(marcador: any, position: { lat: number; lng: number }) {
  if (!marcador) return;
  if (typeof marcador.setPosition === "function") {
    marcador.setPosition(position);
    return;
  }
  marcador.position = position;
}

function quitarDelMapa(objeto: any) {
  if (!objeto) return;
  if (typeof objeto.setMap === "function") {
    objeto.setMap(null);
    return;
  }
  objeto.map = null;
}

function ajustar(mapa: any, puntos: { lat: number; lng: number }[]) {
  const maps = (window as any).google?.maps;
  if (!maps || puntos.length === 0) return;
  if (puntos.length === 1) {
    mapa.setCenter(puntos[0]);
    if (typeof mapa.setZoom === "function") mapa.setZoom(14);
    return;
  }
  try {
    const bounds = new maps.LatLngBounds();
    puntos.forEach((p) => bounds.extend(p));
    mapa.fitBounds(bounds);
  } catch {
    mapa.setCenter(puntos[0]);
  }
}
