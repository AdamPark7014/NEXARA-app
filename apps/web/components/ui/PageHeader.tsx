"use client";

import type { CSSProperties, ReactNode } from "react";
import { PageHead } from "@/components/base/PageHead";

/**
 * NEXARA · PageHeader (envoltorio de `components/base/PageHead`)
 *
 * Jerarquía: (volver / migas) → eyebrow → título → subtítulo → meta · acciones.
 * Misma API de siempre; el dibujo es el del encabezado base (título 22 px,
 * acciones a la derecha alineadas con la última línea del texto).
 *
 * Variantes: default · hero (portada de módulo, título más grande y más aire)
 * — densidad: default · ops (título compacto, menos aire).
 * En teléfono las acciones bajan a su propia fila, alineadas a la izquierda.
 */

type Variant = "default" | "hero";
type Density = "default" | "ops";

export type PageHeaderCrumb = { label: ReactNode; href?: string };

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  meta,
  variant = "default",
  density = "default",
  className,
  style,
  breadcrumbs,
  backHref,
  backLabel = "Volver",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Píldoras/badges extra debajo del subtítulo (status, sla, dueño…). */
  meta?: ReactNode;
  variant?: Variant;
  /** ops = título compacto, subtítulo corto, menos aire (ERP/OPS). */
  density?: Density;
  className?: string;
  style?: CSSProperties;
  /** Migas sobre el título: `[{ label: "Clientes", href: "/erp/clientes" }, { label: "Detalle" }]`. */
  breadcrumbs?: PageHeaderCrumb[] | ReactNode;
  /** Enlace «← Volver» sobre el título (pantallas de detalle). */
  backHref?: string;
  backLabel?: string;
}) {
  const isHero = variant === "hero";
  const isOps = density === "ops";
  return (
    <PageHead
      title={title}
      description={subtitle}
      actions={actions}
      meta={meta}
      eyebrow={eyebrow}
      breadcrumbs={breadcrumbs}
      back={backHref ? { href: backHref, label: backLabel } : undefined}
      variant={variant}
      density={density}
      className={className}
      style={{
        // El aire es lo único que separa la cabecera del contenido.
        ...(isHero ? { marginBottom: 32 } : isOps ? { marginBottom: 12 } : null),
        ...style,
      }}
    />
  );
}
