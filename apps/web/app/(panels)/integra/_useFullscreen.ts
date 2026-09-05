"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Pantalla completa de verdad (`requestFullscreen`), que en este panel no
 * existía: «foco» solo cambiaba de pestaña interna y el mosaico seguía dentro
 * del cromo del navegador y de la consola.
 *
 * Safari sigue exponiendo solo el prefijo `webkit`, así que se declaran los dos
 * nombres en tipos propios en vez de tirar de `any`.
 */

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

function currentFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  const d = document as FullscreenDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export function fullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  const d = document as FullscreenDocument;
  return Boolean(d.fullscreenEnabled || typeof d.webkitExitFullscreen === "function");
}

export function useFullscreen() {
  const [element, setElement] = useState<Element | null>(null);

  useEffect(() => {
    const sync = () => setElement(currentFullscreenElement());
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const exit = useCallback(() => {
    const d = document as FullscreenDocument;
    if (!currentFullscreenElement()) return;
    if (typeof d.exitFullscreen === "function") {
      void d.exitFullscreen().catch(() => undefined);
    } else if (typeof d.webkitExitFullscreen === "function") {
      void d.webkitExitFullscreen();
    }
  }, []);

  const request = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const node = el as FullscreenElement;
    if (typeof node.requestFullscreen === "function") {
      // El rechazo (gesto de usuario ausente, iframe sin `allow`) no debe
      // ensuciar la consola con un unhandled rejection.
      void node.requestFullscreen().catch(() => undefined);
    } else if (typeof node.webkitRequestFullscreen === "function") {
      void node.webkitRequestFullscreen();
    }
  }, []);

  const toggle = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      const active = currentFullscreenElement();
      if (active === el) exit();
      else request(el);
    },
    [exit, request],
  );

  return { element, request, exit, toggle };
}
