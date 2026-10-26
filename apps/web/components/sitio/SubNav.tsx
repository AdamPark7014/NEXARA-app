"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import p from "./paginas.module.css";
import { ruta } from "./rutas";

type Props = {
  titulo: string;
  secciones: { id: string; label: string }[];
  cta?: { href: string; label: string };
};

/**
 * Sub-barra fija bajo el encabezado (como en las páginas de producto): el nombre de la página, sus
 * secciones y un botón. Marca la sección que está a la vista.
 */
export default function SubNav({ titulo, secciones, cta }: Props) {
  const [activa, setActiva] = useState<string | undefined>();

  useEffect(() => {
    const primera = secciones[0]?.id;
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) setActiva(e.target.id);
          // Arriba de la primera sección no hay ninguna marcada.
          else if (e.target.id === primera && e.boundingClientRect.top > 0) setActiva(undefined);
        }
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    secciones.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [secciones]);

  return (
    <nav className={p.subnav} aria-label={`Secciones de ${titulo}`}>
      <div className={p.subnavFila}>
        <span className={p.subnavTitulo}>{titulo}</span>
        <div className={p.subnavEnlaces}>
          {secciones.map((sec) => (
            <a key={sec.id} href={`#${sec.id}`} className={p.subnavEnlace} aria-current={activa === sec.id ? "true" : undefined}>
              {sec.label}
            </a>
          ))}
        </div>
        {cta ? (
          <Link href={ruta(cta.href)} className={p.subnavCta}>
            {cta.label}
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
