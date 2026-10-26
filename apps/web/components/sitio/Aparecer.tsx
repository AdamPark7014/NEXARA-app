"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Hace aparecer suavemente los bloques `[data-aparecer]` al entrar en pantalla.
 * Solo esconde los que están bajo el pliegue al cargar: lo que ya se ve nunca
 * parpadea, y sin JavaScript todo queda visible.
 */
export default function Aparecer() {
  const ruta = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const nodos = Array.from(document.querySelectorAll<HTMLElement>("[data-aparecer]"));
    const pendientes = nodos.filter((n) => n.getBoundingClientRect().top > window.innerHeight * 0.92);
    if (!pendientes.length) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          e.target.removeAttribute("data-oculto");
          observador.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    for (const n of pendientes) {
      n.setAttribute("data-oculto", "");
      observador.observe(n);
    }
    return () => {
      observador.disconnect();
      for (const n of pendientes) n.removeAttribute("data-oculto");
    };
  }, [ruta]);

  return null;
}
