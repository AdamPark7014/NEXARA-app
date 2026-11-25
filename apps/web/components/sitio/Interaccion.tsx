"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { aplicarPausa, leerPausa } from "./pausa";

/**
 * Lo que responde al cursor en todo el sitio, con un solo oyente:
 *  - `data-luz`: el borde de la pieza se enciende alrededor del cursor (`--mx`, `--my`).
 *  - `data-inclina`: la pieza se inclina hacia el cursor (`--rx`, `--ry`).
 *  - las zonas de noche (`data-hero-noche`, `data-noche-zona`) llevan una luz que sigue al cursor.
 * Con el dedo no hay cursor: se enciende la pieza que va a media pantalla (`data-encendida`).
 */
export default function Interaccion() {
  const camino = usePathname();

  useEffect(() => {
    if (leerPausa()) aplicarPausa(true);
  }, []);

  useEffect(() => {
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (window.matchMedia("(hover: none)").matches) {
      const obs = new IntersectionObserver(
        (entradas) => entradas.forEach((e) => e.target.toggleAttribute("data-encendida", e.isIntersecting)),
        { rootMargin: "-38% 0px -38% 0px" },
      );
      document.querySelectorAll("[data-sitio] [data-luz]").forEach((el) => obs.observe(el));
      return () => obs.disconnect();
    }

    let cuadro = 0;
    let inclinada: HTMLElement | null = null;
    let ultimo: PointerEvent | null = null;

    const soltar = () => {
      inclinada?.style.removeProperty("--rx");
      inclinada?.style.removeProperty("--ry");
      inclinada = null;
    };

    const pintar = () => {
      cuadro = 0;
      const destino = ultimo?.target;
      if (!ultimo || !(destino instanceof Element)) return;
      const { clientX, clientY } = ultimo;
      for (const el of [
        destino.closest<HTMLElement>("[data-luz]"),
        destino.closest<HTMLElement>("[data-hero-noche], [data-noche-zona]"),
      ]) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${(clientX - r.left).toFixed(0)}px`);
        el.style.setProperty("--my", `${(clientY - r.top).toFixed(0)}px`);
      }
      if (quieto) return;
      const inc = destino.closest<HTMLElement>("[data-inclina]");
      if (inc !== inclinada) soltar();
      if (inc) {
        inclinada = inc;
        const r = inc.getBoundingClientRect();
        const grados = Number(inc.dataset.inclina) || 5;
        inc.style.setProperty("--ry", `${(((clientX - r.left) / r.width - 0.5) * 2 * grados).toFixed(2)}deg`);
        inc.style.setProperty("--rx", `${((0.5 - (clientY - r.top) / r.height) * 2 * grados).toFixed(2)}deg`);
      }
    };

    const alMover = (ev: PointerEvent) => {
      if (ev.pointerType === "touch") return;
      ultimo = ev;
      if (!cuadro) cuadro = requestAnimationFrame(pintar);
    };
    document.addEventListener("pointermove", alMover, { passive: true });
    document.documentElement.addEventListener("pointerleave", soltar);
    return () => {
      document.removeEventListener("pointermove", alMover);
      document.documentElement.removeEventListener("pointerleave", soltar);
      cancelAnimationFrame(cuadro);
      soltar();
    };
  }, [camino]);

  return null;
}
