"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useVisibleOnce } from "@/lib/use-visible-once";
import { CENTRO_PREDETERMINADO, ESTILO_MAPA_URL, cargarMapLibre } from "@/lib/maplibre-cargar";
import { hasUsableCoords } from "@/lib/static-map";
import s from "./mapas.module.css";

/**
 * Mapa para fijar una ubicación: pin arrastrable y clic para colocarlo.
 *
 * Reemplaza la imagen de Google Static Maps del selector de ubicación de sucursales (403 sin
 * facturación) por un mapa de MapLibre + OpenFreeMap. Antes el pin no se podía mover; ahora quien
 * captura la sucursal lo arrastra al sitio exacto o toca el mapa, y `onMover` recibe el punto.
 * Sin `onMover` el mapa solo se ve (el pin no se mueve).
 */
export default function MapaUbicacion({
  lat,
  lng,
  onMover,
  altura = 220,
}: {
  lat?: number | null;
  lng?: number | null;
  onMover?: (lat: number, lng: number) => void;
  altura?: number;
}) {
  const [ref, visible] = useVisibleOnce<HTMLDivElement>();
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pinRef = useRef<Marker | null>(null);
  const onMoverRef = useRef(onMover);
  onMoverRef.current = onMover;
  const [estado, setEstado] = useState<"cargando" | "listo" | "fallo">("cargando");
  const usable = lat != null && lng != null && hasUsableCoords(lat, lng);
  const puntoRef = useRef<[number, number] | null>(usable ? [lng!, lat!] : null);
  puntoRef.current = usable ? [lng!, lat!] : null;
  const editable = Boolean(onMover);

  useEffect(() => {
    const host = contenedorRef.current;
    if (!visible || !host) return;
    let cancelado = false;
    let falla: number | null = null;

    void (async () => {
      try {
        const lib = await cargarMapLibre();
        if (cancelado) return;
        const inicio = puntoRef.current;
        const map = new lib.Map({
          container: host,
          style: ESTILO_MAPA_URL,
          center: inicio ?? CENTRO_PREDETERMINADO,
          zoom: inicio ? 16 : 11,
          attributionControl: { compact: true },
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        mapRef.current = map;
        map.touchZoomRotate.disableRotation();
        map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");

        // MapLibre mueve el marcador con `transform`: la gota girada va en un hijo.
        const elemento = document.createElement("div");
        const gota = document.createElement("span");
        gota.className = s.pinMapa;
        elemento.appendChild(gota);
        elemento.setAttribute("aria-label", editable ? "Ubicación (arrástrala para ajustarla)" : "Ubicación");
        const pin = new lib.Marker({ element: elemento, anchor: "bottom", draggable: editable });
        pinRef.current = pin;
        if (inicio) pin.setLngLat(inicio).addTo(map);

        const avisar = (lngLat: { lng: number; lat: number }) => {
          onMoverRef.current?.(Number(lngLat.lat.toFixed(6)), Number(lngLat.lng.toFixed(6)));
        };
        if (editable) {
          pin.on("dragend", () => avisar(pin.getLngLat()));
          map.on("click", (e) => {
            pin.setLngLat(e.lngLat);
            if (!pin.getElement().isConnected) pin.addTo(map);
            avisar(e.lngLat);
          });
        }
        map.on("load", () => {
          if (falla) window.clearTimeout(falla);
          if (!cancelado) setEstado("listo");
        });
        falla = window.setTimeout(() => {
          if (!cancelado && !map.loaded()) setEstado("fallo");
        }, 12_000);
      } catch {
        if (!cancelado) setEstado("fallo");
      }
    })();

    return () => {
      cancelado = true;
      if (falla) window.clearTimeout(falla);
      mapRef.current?.remove();
      mapRef.current = null;
      pinRef.current = null;
    };
    // El mapa se crea una vez; los cambios de punto se aplican abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editable]);

  // El punto cambió desde fuera (búsqueda, coordenadas pegadas): el pin y la vista lo siguen.
  useEffect(() => {
    const map = mapRef.current;
    const pin = pinRef.current;
    if (!map || !pin || !usable) return;
    const actual = pin.getElement().isConnected ? pin.getLngLat() : null;
    if (actual && Math.abs(actual.lat - lat!) < 1e-7 && Math.abs(actual.lng - lng!) < 1e-7) return;
    pin.setLngLat([lng!, lat!]);
    if (!pin.getElement().isConnected) pin.addTo(map);
    map.jumpTo({ center: [lng!, lat!], zoom: Math.max(map.getZoom(), 15) });
  }, [lat, lng, usable, estado]);

  return (
    <div ref={ref} className={s.marco} style={{ height: altura }} data-estado={estado}>
      <div ref={contenedorRef} className={s.mapa} />
      {estado === "cargando" ? <div className={s.aviso}>Cargando mapa…</div> : null}
      {estado === "fallo" ? <div className={s.aviso}>No se pudo dibujar el mapa.</div> : null}
      {estado === "listo" && editable ? (
        <div className={s.ayuda}>{usable ? "Arrastra el pin o toca el mapa para ajustar" : "Toca el mapa para marcar la ubicación"}</div>
      ) : null}
    </div>
  );
}
