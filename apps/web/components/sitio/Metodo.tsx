"use client";

import { useEffect, useRef, useState } from "react";
import s from "./sitio.module.css";

export type PasoMetodo = { num: string; titulo: string; texto: string; foto: { src: string; srcSet?: string; alt: string } };

/**
 * El método se cuenta al bajar: el índice de la izquierda queda fijo y marca el paso
 * que está a media pantalla. En tablet y celular es una lista normal.
 */
export default function Metodo({
  antetitulo,
  titulo,
  lead,
  pasos,
}: {
  antetitulo: string;
  titulo: React.ReactNode;
  lead: string;
  pasos: PasoMetodo[];
}) {
  const [activo, setActivo] = useState(0);
  const tarjetas = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) setActivo(Number((e.target as HTMLElement).dataset.indice));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    tarjetas.current.forEach((t) => t && obs.observe(t));
    return () => obs.disconnect();
  }, []);

  const ir = (i: number) =>
    tarjetas.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className={s.metodo}>
      <div className={s.metodoPegado}>
        <p className={s.antetitulo}>{antetitulo}</p>
        <h2 className={s.titulo}>{titulo}</h2>
        <p className={s.lead}>{lead}</p>
        <div className={s.metodoIndice}>
          {pasos.map((p, i) => (
            <button key={p.num} type="button" aria-current={i === activo ? "step" : undefined} onClick={() => ir(i)}>
              <span>{p.num}</span>
              {p.titulo}
            </button>
          ))}
        </div>
      </div>
      <ol className={s.metodoPasos}>
        {pasos.map((p, i) => (
          <li
            key={p.num}
            ref={(el) => {
              tarjetas.current[i] = el;
            }}
            data-indice={i}
            data-activo={i === activo ? "true" : "false"}
            className={s.metodoPaso}
          >
            <div className={s.metodoFoto}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.foto.src} srcSet={p.foto.srcSet} sizes="(max-width: 1068px) 100vw, 680px" alt={p.foto.alt} loading="lazy" decoding="async" />
            </div>
            <div className={s.metodoTexto}>
              <p className={s.metodoNumero}>Paso {p.num}</p>
              <h3 className={s.metodoTitulo}>{p.titulo}</h3>
              <p className={s.metodoCopia}>{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
