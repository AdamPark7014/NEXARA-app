"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Ancho real en píxeles CSS del elemento, vigilado con `ResizeObserver`.
 *
 * Existe porque la decisión de pedir alta calidad es **por tamaño del elemento**
 * y no por modo de vista: el mismo Foco mide 1400 px en un escritorio y 700 en
 * una ventana a media pantalla, y en el segundo caso subir a 1080p no añadiría
 * un píxel visible. Entrar en pantalla completa, plegar el rail o arrastrar el
 * borde de la ventana cambian el número, así que se mide en vivo en vez de
 * consultarlo una vez al montar.
 *
 * Devuelve `null` mientras no hay medida —o si el navegador no trae
 * `ResizeObserver`—, y quien decide trata ese `null` como «no pidas HD»: ante
 * la duda, el comportamiento de siempre.
 *
 * `activo` permite dejar de medir lo que está oculto: un elemento con `hidden`
 * mide 0 y eso ya diría que no, pero así tampoco se paga el observador.
 */
export function useElementWidth(
  ref: RefObject<HTMLElement | null>,
  activo = true,
  /**
   * Valor que cambia cuando el elemento aparece o se reemplaza. Hace falta
   * porque un `ref` no es reactivo: si el escenario todavía no estaba montado
   * la primera vez, sin esto no se volvería a mirar nunca.
   */
  clave?: unknown,
): number | null {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!activo) {
      setWidth(null);
      return;
    }
    const el = ref.current;
    if (!el) {
      setWidth(null);
      return;
    }
    if (typeof ResizeObserver === "undefined") {
      setWidth(el.getBoundingClientRect().width || null);
      return;
    }
    const medir = () => {
      const w = el.getBoundingClientRect().width;
      setWidth((prev) => (prev != null && Math.abs(prev - w) < 1 ? prev : w));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, activo, clave]);

  return width;
}
