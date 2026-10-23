"use client";

import { useEffect, useRef } from "react";
import { alturaBarra, rms, suavizar } from "@/lib/transcripcion-vivo";
import s from "./reuniones.module.css";

const BARRAS = 48;
const ANCHO_BARRA = 3;
const SEPARACION = 2;
const ALTO = 32;
const CUADRO_MS = 50; // ~20 cuadros por segundo

/**
 * Onda en vivo como una nota de voz de WhatsApp: barras que corren de derecha a izquierda con el
 * nivel real del micrófono; en silencio, puntitos. Canvas + requestAnimationFrame: React no se
 * vuelve a pintar por cuadro. Con «reducir movimiento», solo un indicador de nivel sin desplazar.
 */
export default function OndaVoz({ analizador, activo }: { analizador: AnalyserNode | null; activo: boolean }) {
  const lienzo = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = lienzo.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const dpr = window.devicePixelRatio || 1;
    const ancho = BARRAS * (ANCHO_BARRA + SEPARACION);
    c.width = Math.round(ancho * dpr);
    c.height = Math.round(ALTO * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const color = getComputedStyle(c).color || "#1F9E84";
    const valores = new Float32Array(BARRAS);
    const datos = new Float32Array(new ArrayBuffer((analizador?.fftSize ?? 2048) * 4));
    let suave = 0;
    let ultimo = 0;
    let cuadro = 0;

    const barra = (i: number, h: number) => {
      const x = i * (ANCHO_BARRA + SEPARACION);
      g.beginPath();
      if (h <= 0) {
        g.arc(x + ANCHO_BARRA / 2, ALTO / 2, 1.3, 0, Math.PI * 2);
      } else {
        g.roundRect(x, (ALTO - h) / 2, ANCHO_BARRA, h, ANCHO_BARRA / 2);
      }
      g.fill();
    };

    const pintar = (t: number) => {
      cuadro = requestAnimationFrame(pintar);
      if (t - ultimo < CUADRO_MS) return;
      ultimo = t;
      let nivel = 0;
      if (analizador && activo) {
        analizador.getFloatTimeDomainData(datos);
        nivel = rms(datos);
      }
      suave = suavizar(suave, nivel);
      g.clearRect(0, 0, ancho, ALTO);
      g.fillStyle = color;
      if (reducido) {
        // Indicador fijo: tantas barras encendidas como nivel; el resto, puntitos.
        const encendidas = Math.round((alturaBarra(suave, ALTO) / ALTO) * BARRAS);
        for (let i = 0; i < BARRAS; i++) barra(i, i < encendidas ? ALTO * 0.5 : 0);
        return;
      }
      valores.copyWithin(0, 1);
      valores[BARRAS - 1] = suave;
      for (let i = 0; i < BARRAS; i++) barra(i, alturaBarra(valores[i], ALTO));
    };
    cuadro = requestAnimationFrame(pintar);
    return () => cancelAnimationFrame(cuadro);
  }, [analizador, activo]);

  return <canvas ref={lienzo} className={s.onda} style={{ width: BARRAS * (ANCHO_BARRA + SEPARACION), height: ALTO }} aria-hidden="true" />;
}
