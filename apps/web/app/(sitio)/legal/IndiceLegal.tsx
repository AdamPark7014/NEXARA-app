"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import PublicIcon, { type PublicIconName } from "@/app/components/PublicIcon";
import { SENALES } from "@/components/sitio/senales";
import x from "@/components/sitio/profundo.module.css";
import styles from "./legal.module.css";

const DOCUMENTOS: { href: string; label: string; icono: PublicIconName }[] = [
  { href: "/legal/privacidad", label: "Aviso de privacidad", icono: "lock" },
  { href: "/legal/terminos", label: "Términos y condiciones", icono: "fileCheck" },
  { href: "/legal/cookies", label: "Política de cookies", icono: "shield" },
  { href: "/legal/eliminar-cuenta", label: "Eliminar tu cuenta", icono: "users" },
  { href: "/legal/marca", label: "Uso de marca", icono: "layers" },
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
    <aside className={styles.indice} aria-label="Índice del documento">
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

/** Los documentos como tarjetas en la portada del centro legal; la del documento abierto queda encendida. */
export function DocumentosLegales() {
  const ruta = usePathname();
  return (
    <nav aria-label="Documentos legales">
      <ul className={x.legalDocs}>
        {DOCUMENTOS.map((d, i) => (
          <li key={d.href} style={{ "--c": SENALES[i % 5].color } as CSSProperties}>
            <Link href={d.href} aria-current={ruta === d.href ? "page" : undefined} data-luz="">
              <span aria-hidden="true">
                <PublicIcon name={d.icono} size={22} />
              </span>
              {d.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
