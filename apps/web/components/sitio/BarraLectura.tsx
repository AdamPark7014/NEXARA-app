"use client";

import { useEffect, useRef } from "react";
import i from "./interior.module.css";

/**
 * Barra de avance de lectura bajo el encabezado: se llena según lo leído del artículo cuyo id se indica. Se mueve
 * con `transform` en un cuadro de animación, sin volver a renderizar React en cada scroll.
 */
export default function BarraLectura({ articulo }: { articulo: string }) {
  const barra = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      const el = document.getElementById(articulo);
      const b = barra.current;
      if (!el || !b) return;
      const r = el.getBoundingClientRect();
      const recorrido = r.height - window.innerHeight * 0.6;
      const avance = recorrido > 0 ? Math.min(1, Math.max(0, -r.top / recorrido)) : 1;
      b.style.transform = `scaleX(${avance})`;
    };
    const alMover = () => {
      if (!cuadro) cuadro = requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener("scroll", alMover, { passive: true });
    window.addEventListener("resize", alMover);
    return () => {
      window.removeEventListener("scroll", alMover);
      window.removeEventListener("resize", alMover);
      if (cuadro) cancelAnimationFrame(cuadro);
    };
  }, [articulo]);

  return <div ref={barra} className={i.barraLectura} aria-hidden="true" />;
}
