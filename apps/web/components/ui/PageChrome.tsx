"use client";

import { ReactNode } from "react";
import PageHeader from "./PageHeader";

/**
 * NEXARA · PageChrome
 * Contrato de página de lista/ops: título denso → acción primaria →
 * secundarias (exportar/actualizar) → rail/tabs → fila de filtros.
 * Sin hero de marketing; pensado para densidad de producción.
 */

export default function PageChrome({
  eyebrow,
  title,
  subtitle,
  primaryAction,
  secondaryActions,
  meta,
  context,
  filters,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** CTA principal (crear, timbrar, aprobar…). Una sola. */
  primaryAction?: ReactNode;
  /** Acciones secundarias: Actualizar, Excel, PDF… */
  secondaryActions?: ReactNode;
  meta?: ReactNode;
  /** ContextRail / PanelTabs debajo del header. */
  context?: ReactNode;
  /** FilterToolbar u otra fila de filtros. */
  filters?: ReactNode;
  /** KPIs, tablas, formularios… */
  children?: ReactNode;
}) {
  const actions =
    primaryAction || secondaryActions ? (
      <>
        {secondaryActions}
        {primaryAction}
      </>
    ) : undefined;

  return (
    <div className="nx-page-chrome">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        meta={meta}
        actions={actions}
        density="ops"
      />
      {context}
      {filters ? <div style={{ marginBottom: 16 }}>{filters}</div> : null}
      {children}
    </div>
  );
}
