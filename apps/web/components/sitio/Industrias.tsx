"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import PublicIcon, { type PublicIconName } from "@/app/components/PublicIcon";
import p from "./portada.module.css";

export type Industria = {
  slug: string;
  nombre: string;
  icono: PublicIconName;
  riesgo: string;
  texto: string;
  incluye: string[];
};

/** Lista gigante de industrias: la elegida va rellena y su riesgo, texto y alcance salen a un lado. */
export default function Industrias({ industrias }: { industrias: Industria[] }) {
  const [activa, setActiva] = useState(0);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  const alTeclear = (e: KeyboardEvent) => {
    const adelante = e.key === "ArrowDown" || e.key === "ArrowRight";
    const atras = e.key === "ArrowUp" || e.key === "ArrowLeft";
    if (!adelante && !atras) return;
    e.preventDefault();
    const siguiente = (activa + (adelante ? 1 : -1) + industrias.length) % industrias.length;
    setActiva(siguiente);
    botones.current[siguiente]?.focus();
  };

  const ind = industrias[activa];

  return (
    <div className={p.industrias}>
      <div className={p.industriasLista} role="tablist" aria-label="Industrias" aria-orientation="vertical" onKeyDown={alTeclear}>
        {industrias.map((it, i) => (
          <button
            key={it.slug}
            ref={(el) => {
              botones.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`industria-${it.slug}`}
            aria-selected={i === activa}
            aria-controls="industria-panel"
            tabIndex={i === activa ? 0 : -1}
            className={p.industria}
            onClick={() => setActiva(i)}
          >
            {it.nombre}
          </button>
        ))}
      </div>

      <div id="industria-panel" role="tabpanel" aria-labelledby={`industria-${ind.slug}`} className={p.industriaPanel}>
        <p className={p.industriaEtiqueta}>{ind.nombre}</p>
        <p className={p.industriaRiesgo}>{ind.riesgo}</p>
        <p className={p.industriaTexto}>{ind.texto}</p>
        <ul className={p.industriaLista} aria-label="Lo que instalamos">
          {ind.incluye.map((item) => (
            <li key={item}>
              <PublicIcon name="check" size={18} />
              {item}
            </li>
          ))}
        </ul>
        <div className={p.ligas}>
          <Link href={`/soluciones/${ind.slug}`} className={p.liga}>
            Ver la solución para {ind.nombre.toLowerCase()}
          </Link>
        </div>
      </div>
    </div>
  );
}
