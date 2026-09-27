"use client";

import Link from "next/link";
import { isValidElement, type CSSProperties, type ReactNode } from "react";
import styles from "./PageHeader.module.scss";

/**
 * NEXARA · PageHeader
 *
 * Jerarquía: (volver / migas) → eyebrow → título → subtítulo → meta · acciones.
 *
 * `hero` era una tarjeta translúcida con borde, sombra y un resplandor
 * radial detrás del título. Ahora `hero` significa **más aire y más
 * tamaño**, que es lo que de verdad lo hacía importante; la caja, el
 * degradado y el glow se fueron. Ningún variante dibuja un rectángulo.
 *
 * Variantes: default · hero (portada de módulo) — densidad: default · ops.
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

  const titleSize = isHero
    ? "clamp(1.7rem, 1.2rem + 1.6vw, 2.4rem)"
    : isOps
      ? "clamp(1.2rem, 1rem + 0.7vw, 1.55rem)"
      : "clamp(1.5rem, 1.1rem + 1.3vw, 2rem)";

  const crumbs =
    Array.isArray(breadcrumbs) && !isValidElement(breadcrumbs) ? (breadcrumbs as PageHeaderCrumb[]) : null;

  return (
    <header
      className={[styles.header, className].filter(Boolean).join(" ")}
      data-density={density}
      data-variant={variant}
      style={{
        // El aire es lo único que separa la cabecera del contenido.
        marginBottom: isHero ? 32 : isOps ? 12 : 20,
        ...style,
      }}
    >
      {backHref || breadcrumbs ? (
        <div className={styles.topRow}>
          {backHref ? (
            <Link href={backHref} className={styles.back}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
                <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {backLabel}
            </Link>
          ) : null}
          {crumbs ? (
            <nav aria-label="Ruta de la página" className={styles.crumbs}>
              <ol>
                {crumbs.map((c, i) => {
                  const last = i === crumbs.length - 1;
                  return (
                    <li key={i}>
                      {c.href && !last ? (
                        <Link href={c.href}>{c.label}</Link>
                      ) : (
                        <span aria-current={last ? "page" : undefined}>{c.label}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          ) : breadcrumbs ? (
            <div className={styles.crumbs}>{breadcrumbs as ReactNode}</div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.row} style={{ gap: isOps ? 14 : 16 }}>
        <div className={styles.text}>
          {eyebrow && (
            <div
              className={styles.eyebrow}
              style={{ fontSize: isOps ? 10 : 10.5, marginBottom: isOps ? 4 : 6 }}
            >
              <span aria-hidden="true" className={styles.eyebrowRule} />
              {eyebrow}
            </div>
          )}
          <h1 className={styles.title} style={{ fontSize: titleSize }}>
            {title}
          </h1>
          {subtitle && (
            <p
              className={styles.subtitle}
              style={{
                marginTop: isOps ? 4 : 6,
                fontSize: isOps ? "0.8125rem" : "0.9rem",
                // Una línea que se lee, no un párrafo que se salta.
                maxWidth: isOps ? 640 : 720,
              }}
            >
              {subtitle}
            </p>
          )}
          {meta && (
            <div className={styles.meta} style={{ marginTop: isOps ? 8 : 12 }}>
              {meta}
            </div>
          )}
        </div>

        {actions && (
          <div
            className={styles.actions}
            // Compensa la diferencia de línea base contra el título grande.
            style={{ marginTop: isHero ? 6 : 2 }}
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
