"use client";

import { useEffect } from "react";

/**
 * Bloquea el scroll de la página mientras `active` sea true. Cuenta cuántos
 * diálogos lo piden, así un modal encima de otro no suelta el bloqueo antes
 * de tiempo. Compensa el ancho de la barra de scroll para que el contenido de
 * atrás no brinque a la derecha al abrir.
 *
 * El bloqueo va en `<html>`, que es quien desplaza la página (ver `globals.scss`).
 * Ponerlo en `<body>` no detenía el scroll y además convertía a `body` en el
 * contenedor de lo que es `sticky`: el menú lateral y la barra de arriba se
 * iban del lugar al abrir una ventana con la página desplazada.
 */
let locks = 0;
let saved: { overflow: string; paddingRight: string } | null = null;

export function lockScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  const { body, documentElement } = document;
  if (locks === 0) {
    saved = { overflow: documentElement.style.overflow, paddingRight: body.style.paddingRight };
    const scrollbar = window.innerWidth - documentElement.clientWidth;
    documentElement.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0 && saved) {
      documentElement.style.overflow = saved.overflow;
      body.style.paddingRight = saved.paddingRight;
      saved = null;
    }
  };
}

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return lockScroll();
  }, [active]);
}

export default useScrollLock;
