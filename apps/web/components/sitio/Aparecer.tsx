"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Pausa entre bloques que entran juntos (cascada) y su tope. */
const PASO_MS = 70;
const TOPE_MS = 280;
const DURACION_MS = 600;

/**
 * Hace aparecer los bloques `[data-aparecer]` al entrar en pantalla, en cascada cuando entran varios a la vez.
 * Solo esconde los que están bajo el pliegue al cargar (lo que ya se ve nunca parpadea, y sin JavaScript todo
 * queda visible). La transición vive solo mientras el bloque entra (`data-entrando`): después, el hover de las
 * tarjetas conserva sus propios tiempos cortos.
 */
export default function Aparecer() {
  const ruta = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const nodos = Array.from(document.querySelectorAll<HTMLElement>("[data-aparecer]"));
    const pendientes = nodos.filter((n) => n.getBoundingClientRect().top > window.innerHeight * 0.92);
    if (!pendientes.length) return;
    const temporizadores: number[] = [];

    const observador = new IntersectionObserver(
      (entradas) => {
        const entran = entradas.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement);
        entran.forEach((el, i) => {
          observador.unobserve(el);
          const espera = Math.min(i * PASO_MS, TOPE_MS);
          el.setAttribute("data-entrando", "");
          el.style.transitionDelay = `${espera}ms`;
          requestAnimationFrame(() => el.removeAttribute("data-oculto"));
          temporizadores.push(
            window.setTimeout(() => {
              el.removeAttribute("data-entrando");
              el.style.transitionDelay = "";
            }, DURACION_MS + espera + 50),
          );
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    for (const n of pendientes) {
      n.setAttribute("data-oculto", "");
      observador.observe(n);
    }
    return () => {
      observador.disconnect();
      temporizadores.forEach((t) => window.clearTimeout(t));
      for (const n of pendientes) {
        n.removeAttribute("data-oculto");
        n.removeAttribute("data-entrando");
        n.style.transitionDelay = "";
      }
    };
  }, [ruta]);

  return null;
}
