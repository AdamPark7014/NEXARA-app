"use client";

import { useEffect } from "react";

/**
 * Bloquea el scroll de la página mientras `active` sea true. Cuenta cuántos
 * diálogos lo piden, así un modal encima de otro no suelta el bloqueo antes
 * de tiempo. Compensa el ancho de la barra de scroll para que el contenido de
 * atrás no brinque a la derecha al abrir.
 */
let locks = 0;
let saved: { overflow: string; paddingRight: string } | null = null;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const { body, documentElement } = document;
    if (locks === 0) {
      saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
      const scrollbar = window.innerWidth - documentElement.clientWidth;
      body.style.overflow = "hidden";
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    }
    locks += 1;
    return () => {
      locks = Math.max(0, locks - 1);
      if (locks === 0 && saved) {
        body.style.overflow = saved.overflow;
        body.style.paddingRight = saved.paddingRight;
        saved = null;
      }
    };
  }, [active]);
}

export default useScrollLock;
