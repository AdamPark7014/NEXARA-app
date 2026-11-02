"use client";

import type { ReactNode } from "react";
import { PageHead } from "@/components/base";
import ContabilidadSidebar from "@/components/erp/ContabilidadSidebar";
import s from "./MesaPagina.module.css";

/**
 * Marco de cada pantalla de la Mesa contable: título con sus acciones, chips debajo y el
 * contenido al final, el mismo orden de la maqueta aprobada el 29-10-2026. Lo que no se pasa
 * no se pinta.
 */
export function MesaPagina({
  titulo,
  descripcion,
  eyebrow = "Finanzas · Mesa contable",
  meta,
  terciarias,
  secundarias,
  primaria,
  children,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  eyebrow?: ReactNode;
  /** Insignias o datos cortos bajo la descripción. */
  meta?: ReactNode;
  terciarias?: ReactNode;
  secundarias?: ReactNode;
  /** La acción a la que vino la persona. Una sola; va al final. */
  primaria?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={s.pagina}>
      <PageHead
        className={s.cabeza}
        eyebrow={eyebrow}
        title={titulo}
        description={descripcion}
        meta={meta}
        tertiaryActions={terciarias}
        secondaryActions={secundarias}
        primaryAction={primaria}
      />
      <ContabilidadSidebar />
      {children}
    </div>
  );
}
