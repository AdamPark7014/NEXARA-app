"use client";

import { useLayoutEffect } from "react";

/**
 * Sitio público: un solo tema claro. La app interna no hereda esta clase.
 */
export default function PublicSiteThemeLock() {
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-public-theme", "light");
    document.documentElement.classList.remove("dark");
    document.body.classList.remove("dark");
    document.body.classList.add("light");
    return () => {
      document.body.classList.remove("light");
    };
  }, []);
  return null;
}
