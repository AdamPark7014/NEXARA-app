"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import s from "./sitio.module.css";
import Ampliar from "./Ampliar";
import Flecha from "./Flecha";

export type FotoGaleria = { src: string; srcSet?: string; alt: string; tema: string; pie: string };

/** Carrusel horizontal con imán y flechas, alineado al borde del contenido. */
export default function Galeria({ fotos, enlace }: { fotos: FotoGaleria[]; enlace?: { href: string; label: string } }) {
  const pista = useRef<HTMLUListElement>(null);
  const [alInicio, setAlInicio] = useState(true);
  const [alFinal, setAlFinal] = useState(false);

  const medir = useCallback(() => {
    const p = pista.current;
    if (!p) return;
    setAlInicio(p.scrollLeft < 8);
    setAlFinal(p.scrollLeft + p.clientWidth >= p.scrollWidth - 8);
    // Cada tarjeta gira hacia el centro según qué tan lejos va (`--k` de -1 a 1).
    const centro = p.scrollLeft + p.clientWidth / 2;
    for (const li of Array.from(p.children) as HTMLElement[]) {
      const k = (li.offsetLeft + li.offsetWidth / 2 - centro) / p.clientWidth;
      li.style.setProperty("--k", Math.max(-1, Math.min(1, k)).toFixed(3));
    }
  }, []);

  useEffect(() => {
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [medir]);

  const mover = (dir: 1 | -1) => {
    const p = pista.current;
    if (!p) return;
    const tarjeta = p.querySelector("li");
    const paso = tarjeta ? tarjeta.getBoundingClientRect().width + 20 : p.clientWidth * 0.8;
    p.scrollBy({ left: dir * paso, behavior: "smooth" });
  };

  return (
    <div className={s.galeria}>
      <ul ref={pista} className={s.pista} onScroll={medir} aria-label="Fotografías de proyectos">
        {fotos.map((f, i) => (
          <li key={f.src} className={s.tarjeta}>
            <figure>
              <Ampliar src={f.src} pie={f.pie} className={s.tarjetaFoto}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.src} srcSet={f.srcSet} sizes="(max-width: 734px) 80vw, 400px" alt={f.alt} loading="lazy" decoding="async" />
              </Ampliar>
              <figcaption className={s.tarjetaTexto}>
                <span className={s.tarjetaTema}>
                  {String(i + 1).padStart(2, "0")} · {f.tema}
                </span>
                <span className={s.tarjetaPie}>{f.pie}</span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <div className={`${s.contenedor} ${s.galeriaBarra}`}>
        {enlace ? (
          <Link href={enlace.href} className={s.enlace}>
            {enlace.label}
            <Flecha />
          </Link>
        ) : (
          <span />
        )}
        <div className={s.controles}>
          <button type="button" className={s.control} onClick={() => mover(-1)} disabled={alInicio} aria-label="Anterior">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button type="button" className={s.control} onClick={() => mover(1)} disabled={alFinal} aria-label="Siguiente">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
