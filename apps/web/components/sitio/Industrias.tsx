"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import PublicIcon, { type PublicIconName } from "@/app/components/PublicIcon";
import v from "./vivo.module.css";
import Flecha from "./Flecha";
import { foto } from "./fotos";
import { SENALES } from "./senales";
import { enCalma } from "./pausa";

/** Foto de trabajo real de NEXARA detrás de cada industria. */
const FOTOS: Record<string, { nombre: string; posicion: string }> = {
  retail: { nombre: "muro-video-ancho", posicion: "center 40%" },
  manufactura: { nombre: "campo-instalacion-rack", posicion: "center 35%" },
  hospitalidad: { nombre: "tecnico-nexara-entrega-equipo-sitio", posicion: "center 30%" },
  salud: { nombre: "rack-nexara-led", posicion: "center 45%" },
  educacion: { nombre: "control-acceso-torniquetes", posicion: "center 60%" },
  gobierno: { nombre: "sala-monitoreo-videowall-nexara", posicion: "center 25%" },
};

export type Industria = {
  slug: string;
  nombre: string;
  icono: PublicIconName;
  riesgo: string;
  texto: string;
  incluye: string[];
};

const CADA_MS = 5200;

/**
 * Las industrias como puertas: la elegida se abre a lo ancho con su foto y lo que se instala; las demás quedan como
 * lomos. Avanza sola mientras está a la vista y se detiene en cuanto la persona elige.
 */
export default function Industrias({ industrias }: { industrias: Industria[] }) {
  const [activa, setActiva] = useState(0);
  const [solo, setSolo] = useState(true);
  const [visible, setVisible] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.45 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const corre = solo && visible;
  useEffect(() => {
    // En el teléfono las puertas se apilan: si avanzara sola, la página brincaría bajo el dedo.
    if (!corre || window.matchMedia("(max-width: 900px)").matches) return;
    const id = window.setTimeout(() => {
      if (!enCalma()) setActiva((a) => (a + 1) % industrias.length);
    }, CADA_MS);
    return () => window.clearTimeout(id);
  }, [corre, activa, industrias.length]);

  const elegir = (i: number) => {
    setSolo(false);
    setActiva(i);
  };

  return (
    <div ref={raiz} className={v.puertas}>
      {industrias.map((ind, i) => {
        const imagen = FOTOS[ind.slug];
        const abierta = i === activa;
        return (
          <article
            key={ind.slug}
            className={v.puerta}
            data-abierta={abierta ? "" : undefined}
            style={{ "--c": SENALES[i % 5].color } as CSSProperties}
          >
            {imagen ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img {...foto(imagen.nombre, "(max-width: 900px) 100vw, 900px")} alt="" loading="lazy" decoding="async" style={{ objectPosition: imagen.posicion }} />
            ) : null}
            <h3>
              <button
                type="button"
                aria-expanded={abierta}
                aria-controls={`puerta-${ind.slug}`}
                onClick={() => elegir(i)}
                onPointerEnter={(e) => e.pointerType === "mouse" && elegir(i)}
              >
                <span className={v.puertaIcono}>
                  <PublicIcon name={ind.icono} size={22} />
                </span>
                <span className={v.puertaNombre}>{ind.nombre}</span>
              </button>
            </h3>
            <div id={`puerta-${ind.slug}`} className={v.puertaCuerpo} inert={!abierta}>
              <div>
                <p className={v.puertaRiesgo}>{ind.riesgo}</p>
                <p className={v.puertaTexto}>{ind.texto}</p>
                <ul className={v.puertaLista}>
                  {ind.incluye.map((item) => (
                    <li key={item}>
                      <PublicIcon name="check" size={16} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href={`/soluciones/${ind.slug}`} className={v.puertaEnlace}>
                  Ver la solución para {ind.nombre.toLowerCase()}
                  <Flecha />
                </Link>
              </div>
            </div>
            {abierta && solo ? <i className={v.puertaReloj} style={{ animationPlayState: corre ? "running" : "paused" }} aria-hidden="true" /> : null}
          </article>
        );
      })}
    </div>
  );
}
