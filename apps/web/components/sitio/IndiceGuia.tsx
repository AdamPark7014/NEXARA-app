"use client";

import { useEffect, useState, type CSSProperties } from "react";
import x from "./profundo.module.css";

/** Índice de una guía al costado: una pista con un nodo por sección, encendida hasta donde va la lectura. */
export default function IndiceGuia({ secciones }: { secciones: { id: string; titulo: string }[] }) {
  const [activa, setActiva] = useState(0);

  useEffect(() => {
    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      let i = 0;
      secciones.forEach((s, n) => {
        const r = document.getElementById(s.id)?.getBoundingClientRect();
        if (r && r.top < window.innerHeight * 0.4) i = n;
      });
      setActiva(i);
    };
    const pedir = () => {
      if (!cuadro) cuadro = requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener("scroll", pedir, { passive: true });
    return () => {
      window.removeEventListener("scroll", pedir);
      cancelAnimationFrame(cuadro);
    };
  }, [secciones]);

  return (
    <nav
      className={x.indice}
      aria-label="En esta guía"
      style={{ "--avance": secciones.length > 1 ? activa / (secciones.length - 1) : 1 } as CSSProperties}
    >
      <p>En esta guía</p>
      <ol>
        {secciones.map((s, i) => (
          <li key={s.id} data-estado={i === activa ? "aqui" : i < activa ? "visto" : undefined}>
            <a href={`#${s.id}`} aria-current={i === activa ? "location" : undefined}>
              {s.titulo}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
