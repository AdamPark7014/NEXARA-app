"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import PublicIcon, { type PublicIconName } from "@/app/components/PublicIcon";
import s from "./sitio.module.css";
import Flecha from "./Flecha";
import { foto } from "./fotos";

/** Foto de trabajo real de NEXARA detrás de cada industria (antes, un ícono de contorno gigante). */
const FOTOS: Record<string, { nombre: string; alt: string; posicion: string }> = {
  retail: { nombre: "muro-video-ancho", alt: "Muro de video de un centro de monitoreo", posicion: "center 40%" },
  manufactura: { nombre: "campo-instalacion-rack", alt: "Técnicos de NEXARA con equipo de seguridad instalando un rack", posicion: "center 35%" },
  hospitalidad: { nombre: "tecnico-nexara-entrega-equipo-sitio", alt: "Técnico de NEXARA entregando equipo en sitio", posicion: "center 30%" },
  salud: { nombre: "rack-nexara-led", alt: "Rack de servidores y switching instalado por NEXARA", posicion: "center 45%" },
  educacion: { nombre: "control-acceso-torniquetes", alt: "Torniquetes de control de acceso", posicion: "center 60%" },
  gobierno: { nombre: "sala-monitoreo-videowall-nexara", alt: "Sala de monitoreo con muro de video", posicion: "center 25%" },
};

export type Industria = {
  slug: string;
  nombre: string;
  icono: PublicIconName;
  riesgo: string;
  texto: string;
  incluye: string[];
};

/** Control segmentado (estilo iOS) que cambia el panel de cada industria. */
export default function Industrias({ industrias }: { industrias: Industria[] }) {
  const [activa, setActiva] = useState(0);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicador, setIndicador] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const medir = () => {
      const b = botones.current[activa];
      if (b) setIndicador({ x: b.offsetLeft, w: b.offsetWidth });
    };
    medir();
    window.addEventListener("resize", medir);
    document.fonts?.ready.then(medir).catch(() => undefined);
    return () => window.removeEventListener("resize", medir);
  }, [activa]);

  const elegir = (i: number) => {
    setActiva(i);
    const b = botones.current[i];
    const barra = b?.parentElement;
    if (b && barra) barra.scrollTo({ left: b.offsetLeft - barra.clientWidth / 2 + b.offsetWidth / 2, behavior: "smooth" });
  };

  const alTeclear = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const siguiente = (activa + (e.key === "ArrowRight" ? 1 : -1) + industrias.length) % industrias.length;
    elegir(siguiente);
    botones.current[siguiente]?.focus();
  };

  const ind = industrias[activa];
  const imagen = FOTOS[ind.slug];

  return (
    <>
      <div className={s.segmentoMarco}>
        <div className={s.segmentos} role="tablist" aria-label="Industrias" onKeyDown={alTeclear}>
          {indicador ? (
            <span
              className={s.segmentoIndicador}
              style={{ width: indicador.w, transform: `translateX(${indicador.x}px)` }}
              aria-hidden="true"
            />
          ) : null}
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
              className={s.segmento}
              onClick={() => elegir(i)}
            >
              {it.nombre}
            </button>
          ))}
        </div>
      </div>

      <div id="industria-panel" role="tabpanel" aria-labelledby={`industria-${ind.slug}`} className={s.panel}>
        <div key={`t-${ind.slug}`} className={`${s.panelTexto} ${imagen ? s.panelFoto : ""}`}>
          {imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              {...foto(imagen.nombre, "(max-width: 1068px) 100vw, 600px")}
              alt={imagen.alt}
              loading="lazy"
              decoding="async"
              className={s.panelImagen}
              style={{ objectPosition: imagen.posicion }}
            />
          ) : null}
          <span className={s.panelIcono}>
            <PublicIcon name={ind.icono} size={24} />
          </span>
          <p className={s.panelRiesgo}>{ind.riesgo}</p>
          <h3 className={s.panelTitulo}>{ind.nombre}</h3>
          <p className={s.panelCopia}>{ind.texto}</p>
          <p className={s.panelEnlace}>
            <Link href={`/soluciones/${ind.slug}`} className={s.enlace}>
              Ver la solución para {ind.nombre.toLowerCase()}
              <Flecha />
            </Link>
          </p>
        </div>
        <div className={s.panelLista}>
          <p className={s.panelListaTitulo}>Lo que instalamos</p>
          <ul key={`l-${ind.slug}`} className={s.incluye}>
            {ind.incluye.map((item) => (
              <li key={item}>
                <PublicIcon name="check" size={20} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
