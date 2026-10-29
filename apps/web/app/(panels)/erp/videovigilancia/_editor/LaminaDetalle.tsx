"use client";

/**
 * «Referencia de detalle»: la lámina de NEXARA (persona de 1.70 m, placa de prueba y barras de
 * 4, 2 y 1 cm) reducida a la densidad dada —`ppm` píxeles por metro— y vuelta a ampliar sin
 * suavizado. Así se ve lo que entrega la cámara a esa distancia. No usa fotos de terceros.
 */
import { useEffect, useRef } from "react";

const LAMINA = "/cctv/lamina-referencia.svg";

let imagen: Promise<HTMLImageElement> | null = null;
function cargarLamina(): Promise<HTMLImageElement> {
  if (!imagen) {
    imagen = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo cargar la lámina de referencia."));
      img.src = LAMINA;
    });
  }
  return imagen;
}

export default function LaminaDetalle({ ppm, ancho = 200, etiqueta }: { ppm: number; ancho?: number; etiqueta: string }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let vivo = true;
    cargarLamina()
      .then((img) => {
        const destino = lienzo.current;
        if (!vivo || !destino) return;
        const chico = document.createElement("canvas");
        chico.width = Math.max(4, Math.round(ppm * 1));
        chico.height = Math.max(8, Math.round(ppm * 2));
        chico.getContext("2d")?.drawImage(img, 0, 0, chico.width, chico.height);
        const ctx = destino.getContext("2d");
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, destino.width, destino.height);
        ctx.drawImage(chico, 0, 0, destino.width, destino.height);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [ppm]);
  return (
    <canvas
      ref={lienzo}
      width={ancho}
      height={ancho * 2}
      role="img"
      aria-label={etiqueta}
      style={{ width: "100%", height: "auto", display: "block", borderRadius: "var(--ui-radius)", border: "1px solid var(--ui-border)", imageRendering: "pixelated" }}
    />
  );
}
