"use client";

import { useEffect, useState } from "react";
import { useVisibleOnce } from "@/lib/use-visible-once";
import { fotoDeMapa } from "@/lib/mapa-foto";
import { hasUsableCoords } from "@/lib/static-map";
import s from "./mapas.module.css";

/**
 * Vista previa de un punto: la «foto» de un mapa de OpenFreeMap con un pin al centro.
 *
 * Reemplaza a las `<img>` de Google Static Maps (403 sin facturación) en las solicitudes de ticket,
 * el mapa de llegada y la cola de OPS. Es una imagen: el clic lo recibe quien la contiene (casi
 * siempre un enlace a Google Maps), igual que antes. Se dibuja al entrar en pantalla.
 */
export default function MapaVistaPrevia({
  lat,
  lng,
  altura = 180,
  zoom = 15,
  alt = "Vista previa de la ubicación",
  className,
}: {
  lat?: number | string | null;
  lng?: number | string | null;
  altura?: number;
  zoom?: number;
  alt?: string;
  className?: string;
}) {
  const [ref, visible] = useVisibleOnce<HTMLDivElement>({ rootMargin: "200px 0px" });
  const [src, setSrc] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  const la = Number(lat);
  const ln = Number(lng);
  const usable = hasUsableCoords(la, ln);

  useEffect(() => {
    if (!visible || !usable) return;
    let vivo = true;
    setFallo(false);
    const ancho = ref.current?.clientWidth || 600;
    void fotoDeMapa({ lat: la, lng: ln, zoom, ancho, alto: altura }).then((url) => {
      if (!vivo) return;
      if (url) setSrc(url);
      else setFallo(true);
    });
    return () => {
      vivo = false;
    };
    // `ref` es estable; el ancho se mide al dibujar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, usable, la, ln, zoom, altura]);

  return (
    <div
      ref={ref}
      className={[s.vista, className].filter(Boolean).join(" ")}
      style={{ height: altura }}
      role="img"
      aria-label={alt}
      data-estado={!usable ? "sin-punto" : src ? "listo" : fallo ? "fallo" : "cargando"}
    >
      {src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.vistaImagen} src={src} alt="" aria-hidden="true" />
          <span className={s.pin} aria-hidden="true" />
          <span className={s.atribucion}>© OpenStreetMap</span>
        </>
      ) : (
        <span className={s.vistaAviso}>
          {!usable ? "Sin ubicación" : fallo ? "Vista previa no disponible: ábrela en Maps" : "Cargando mapa…"}
        </span>
      )}
    </div>
  );
}
