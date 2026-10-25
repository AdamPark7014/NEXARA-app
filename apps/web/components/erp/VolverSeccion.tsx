"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import q from "./lista-quieta.module.css";

/** Vuelta a la sección: el texto visible es `‹ Sección`. */
export default function VolverSeccion({
  href,
  children,
  onClick,
}: {
  href?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const etiqueta = <>‹ {children}</>;
  if (onClick) {
    return (
      <button type="button" className={q.volver} onClick={onClick}>
        {etiqueta}
      </button>
    );
  }
  return (
    <Link href={href ?? "#"} className={q.volver}>
      {etiqueta}
    </Link>
  );
}
