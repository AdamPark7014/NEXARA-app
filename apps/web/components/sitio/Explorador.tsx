"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import PublicIcon from "@/app/components/PublicIcon";
import Flecha from "./Flecha";
import { foto } from "./fotos";
import { SENALES } from "./senales";
import type { Ruta } from "./TarjetasRuta";
import x from "./profundo.module.css";

export type Exploracion = Ruta & { foto: string };

/**
 * Las opciones como una consola: la lista a un lado y, en la pantalla, la foto de campo con lo que resuelve la elegida.
 * Todas las fichas están en el HTML (con su enlace); solo se enciende una.
 */
export default function Explorador({ rutas, ir }: { rutas: Exploracion[]; ir: string }) {
  const [activa, setActiva] = useState(0);
  return (
    <div className={x.explorador} data-aparecer="" style={{ "--c": SENALES[activa % 5].color } as CSSProperties}>
      <ul className={x.lista}>
        {rutas.map((r, i) => (
          <li key={r.href} style={{ "--c": SENALES[i % 5].color } as CSSProperties}>
            <button
              type="button"
              aria-pressed={i === activa}
              onClick={() => setActiva(i)}
              onPointerEnter={(e) => e.pointerType === "mouse" && setActiva(i)}
            >
              <span className={x.listaIcono}>{r.icono ? <PublicIcon name={r.icono} size={18} /> : null}</span>
              {r.titulo}
              <svg viewBox="0 0 10 10" aria-hidden="true">
                <path d="M3.5 1.5 7 5 3.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <div className={x.pantalla}>
        {rutas.map((r, i) => (
          <article key={r.href} className={x.ficha} data-activa={i === activa ? "" : undefined} inert={i !== activa}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img {...foto(r.foto, "(max-width: 900px) 100vw, 760px")} alt="" loading="lazy" decoding="async" />
            <div className={x.fichaTexto}>
              {r.etiqueta ? <p className={x.fichaEtiqueta}>{r.etiqueta}</p> : null}
              <h3>{r.titulo}</h3>
              {r.texto ? <p>{r.texto}</p> : null}
              <Link href={r.href}>
                {ir}
                <Flecha />
              </Link>
            </div>
          </article>
        ))}
        <span className={x.marco} aria-hidden="true" />
      </div>
    </div>
  );
}
