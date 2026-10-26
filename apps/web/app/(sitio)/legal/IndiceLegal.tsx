"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./legal.module.css";

const DOCUMENTOS = [
  { href: "/legal/privacidad", label: "Aviso de privacidad" },
  { href: "/legal/terminos", label: "Términos y condiciones" },
  { href: "/legal/cookies", label: "Política de cookies" },
  { href: "/legal/eliminar-cuenta", label: "Eliminar tu cuenta" },
  { href: "/legal/marca", label: "Uso de marca" },
];

const aId = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Índice de los documentos legales: la lista de documentos y, en escritorio, las secciones del que está abierto
 * (sacadas de sus `h2`), con la sección que se está leyendo marcada. El texto legal no cambia.
 */
export default function IndiceLegal() {
  const ruta = usePathname();
  const [secciones, setSecciones] = useState<{ id: string; label: string }[]>([]);
  const [activa, setActiva] = useState<string | undefined>();

  useEffect(() => {
    const titulos = Array.from(document.querySelectorAll<HTMLElement>("[data-legal-doc] h2"));
    const usados = new Set<string>();
    setSecciones(
      titulos.map((h) => {
        const texto = h.textContent?.trim() ?? "";
        let id = h.id || aId(texto) || "seccion";
        while (usados.has(id)) id = `${id}-2`;
        usados.add(id);
        h.id = id;
        return { id, label: texto.replace(/^\d+\.\s*/, "") };
      }),
    );

    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      let actual: string | undefined;
      for (const h of titulos) {
        if (h.getBoundingClientRect().top < 160) actual = h.id;
      }
      setActiva(actual);
    };
    const alMover = () => {
      if (!cuadro) cuadro = requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener("scroll", alMover, { passive: true });
    return () => {
      window.removeEventListener("scroll", alMover);
      if (cuadro) cancelAnimationFrame(cuadro);
    };
  }, [ruta]);

  return (
    <aside className={styles.indice} aria-label="Documentos legales">
      <nav className={styles.indiceDocumentos} aria-label="Documentos">
        <p className={styles.indiceTitulo}>Documentos</p>
        <ul>
          {DOCUMENTOS.map((d) => (
            <li key={d.href}>
              <Link href={d.href} aria-current={ruta === d.href ? "page" : undefined}>
                {d.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {secciones.length > 1 ? (
        <nav className={styles.indiceSecciones} aria-label="En esta página">
          <p className={styles.indiceTitulo}>En esta página</p>
          <ul>
            {secciones.map((sc) => (
              <li key={sc.id}>
                <a href={`#${sc.id}`} aria-current={activa === sc.id ? "location" : undefined}>
                  {sc.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </aside>
  );
}
