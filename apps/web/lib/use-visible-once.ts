"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * «¿Este hueco llegó a verse alguna vez?»
 *
 * Los mapas y las imágenes estáticas se montaban con la página, aunque
 * estuvieran debajo del pliegue o detrás de una pestaña cerrada: se pagaba la
 * carga del mapa o la imagen aunque nadie la mirara. Con esto el mapa espera a
 * entrar en pantalla; una vez visto ya no se desmonta (volver a montarlo al
 * salir del viewport sería pagar dos veces).
 *
 * Sin `IntersectionObserver` (navegador muy viejo, jsdom) devuelve `true`: más
 * vale mostrar el mapa que dejar un hueco en blanco.
 */
export function useVisibleOnce<T extends HTMLElement = HTMLDivElement>(
  options?: { rootMargin?: string; enabled?: boolean },
): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const enabled = options?.enabled ?? true;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    if (visible) return;
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: options?.rootMargin ?? "200px" });

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, visible, options?.rootMargin]);

  return [ref, visible && enabled];
}
