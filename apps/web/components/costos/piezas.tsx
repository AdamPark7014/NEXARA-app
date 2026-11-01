"use client";

/**
 * Piezas de Costos: la banda oscura con las pestañas y el hook de acceso. Los estilos viven en
 * `costos.module.scss` con tokens `--ui-*`.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getAcceso, type Acceso, type Tono } from "@/lib/costos";
import c from "./costos.module.scss";

export { c };

const PESTANAS = [
  { href: "/erp/costos", texto: "Horas sin proyecto", requiere: "puedeLigar" },
  { href: "/erp/costos/proyectos", texto: "Por proyecto", requiere: "veTodo" },
  { href: "/erp/costos/tarifas", texto: "Tarifas de costo", requiere: "veTodo" },
] as const;

export function Banda({
  acceso,
  titulo,
  subtitulo,
  acciones,
  children,
}: {
  acceso: Acceso | null;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
  children?: ReactNode;
}) {
  const ruta = usePathname();
  const pestanas = PESTANAS.filter((p) => acceso?.[p.requiere]);
  return (
    <header className={c.band}>
      <div className={c.bandHead}>
        <div>
          <div className={c.crumb}>Costos</div>
          <h1 className={c.bandTitle}>{titulo}</h1>
          {subtitulo ? <p className={c.bandSub}>{subtitulo}</p> : null}
        </div>
        {acciones}
      </div>
      {children}
      {pestanas.length > 1 ? (
        <nav className={c.tabs} aria-label="Secciones de costos">
          {pestanas.map((p) => (
            <Link key={p.href} href={p.href} className={c.tab} aria-current={ruta === p.href ? "page" : undefined}>
              {p.texto}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

export function Kpi({ cifra, texto, tono }: { cifra: ReactNode; texto: ReactNode; tono?: Tono }) {
  return (
    <div className={c.kpi} data-tone={tono}>
      <b>{cifra}</b>
      <span>{texto}</span>
    </div>
  );
}

/** Lo que puede hacer quien entró, según la API. `null` mientras carga. */
export function useAccesoCostos(token: string | null | undefined): Acceso | null {
  const [acceso, setAcceso] = useState<Acceso | null>(null);
  useEffect(() => {
    if (!token) return;
    let vivo = true;
    getAcceso(token)
      .then((a) => vivo && setAcceso(a))
      .catch(() => vivo && setAcceso({ veTodo: false, puedeLigar: false }));
    return () => {
      vivo = false;
    };
  }, [token]);
  return acceso;
}
