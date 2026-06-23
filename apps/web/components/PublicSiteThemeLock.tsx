"use client";

import { useLayoutEffect } from "react";

/**
 * Sitio público (marketing): siempre tema oscuro en <body>.
 * useLayoutEffect evita un frame con variables de tema claro antes de hidratar.
 * Al salir de estas rutas se restaura claro para el resto de la app.
 */
export default function PublicSiteThemeLock() {
  useLayoutEffect(() => {
    document.body.classList.add("dark");
    document.body.classList.remove("light");
    return () => {
      document.body.classList.remove("dark");
      document.body.classList.add("light");
    };
  }, []);
  return null;
}
