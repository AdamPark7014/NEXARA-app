"use client";

import Link from "next/link";
import { isValidElement, type ComponentType, type CSSProperties, type ReactNode } from "react";
import s from "./base.module.css";

export type PageHeadCrumb = { label: ReactNode; href?: string };

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Encabezado de página: título 22 px, una línea de descripción, acciones a la derecha
 * y, si hay, pestañas debajo. Es el mismo en todos los módulos del panel.
 *
 * Acciones: `tertiaryActions` → `secondaryActions` → `actions` → `primaryAction`, en
 * ese orden de izquierda a derecha, para que el primario siempre quede al final.
 */
export function PageHead({
  title,
  description,
  actions,
  back,
  meta,
  tabs,
  eyebrow,
  icon,
  breadcrumbs,
  primaryAction,
  secondaryActions,
  tertiaryActions,
  variant = "default",
  density = "default",
  className,
  style,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Enlace chico arriba del título («‹ Asistencias»). */
  back?: { href: string; label: ReactNode };
  /** Insignias o datos cortos debajo de la descripción. */
  meta?: ReactNode;
  /** Pestañas (<Tabs/>) pegadas al borde inferior del encabezado. */
  tabs?: ReactNode;
  /** Texto chico sobre el título (módulo, contexto). */
  eyebrow?: ReactNode;
  /** Icono del módulo en una pastilla de marca junto al título. */
  icon?: ReactNode;
  /** Migas sobre el título: arreglo `{ label, href }` o nodo propio. */
  breadcrumbs?: PageHeadCrumb[] | ReactNode;
  /** La acción a la que vino la persona: una sola, va al final. */
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  /** Acciones de texto o menú «···»; van primero, separadas por una raya. */
  tertiaryActions?: ReactNode;
  variant?: "default" | "hero";
  density?: "default" | "ops";
  className?: string;
  style?: CSSProperties;
}) {
  const crumbs = Array.isArray(breadcrumbs) && !isValidElement(breadcrumbs) ? (breadcrumbs as PageHeadCrumb[]) : null;
  const hayAcciones = Boolean(tertiaryActions || secondaryActions || actions || primaryAction);
  const restoDeAcciones = Boolean(secondaryActions || actions || primaryAction);
  return (
    <header className={[s.head, className].filter(Boolean).join(" ")} data-variant={variant} data-density={density} style={style}>
      {crumbs ? (
        <nav aria-label="Ruta de la página" className={s.headCrumbs}>
          <ol>
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={i}>
                  {c.href && !last ? <Link href={c.href}>{c.label}</Link> : <span aria-current={last ? "page" : undefined}>{c.label}</span>}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : breadcrumbs ? (
        <div className={s.headCrumbs}>{breadcrumbs as ReactNode}</div>
      ) : null}
      <div className={s.headTop}>
        <div className={s.headText}>
          {back ? (
            <Link href={back.href} className={s.headBack}>
              <Chevron />
              {back.label}
            </Link>
          ) : null}
          {eyebrow ? <div className={s.headEyebrow}>{eyebrow}</div> : null}
          <div className={s.headTitleRow}>
            {icon ? (
              <span className={s.headIcon} aria-hidden="true">
                {icon}
              </span>
            ) : null}
            <h1 className={s.headTitle}>{title}</h1>
          </div>
          {description ? <p className={s.headDesc}>{description}</p> : null}
          {meta ? <div className={s.headMeta}>{meta}</div> : null}
        </div>
        {hayAcciones ? (
          <div className={s.headActions}>
            {tertiaryActions ? <div className={s.headActionsGroup}>{tertiaryActions}</div> : null}
            {tertiaryActions && restoDeAcciones ? <span className={s.headDivider} aria-hidden="true" /> : null}
            {secondaryActions}
            {actions}
            {primaryAction}
          </div>
        ) : null}
      </div>
      {tabs ? <div className={s.headTabs}>{tabs}</div> : null}
    </header>
  );
}

export type TabItem<T extends string> = {
  id: T;
  label: ReactNode;
  icon?: ComponentType<{ "aria-hidden"?: boolean | "true" }>;
  count?: number;
};

/**
 * Pestañas subrayadas. `modo="pestanas"` usa roles tablist/tab; `modo="filtro"` es un
 * grupo de botones con `aria-pressed` (para filtros que se prenden y apagan).
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  modo = "pestanas",
}: {
  items: ReadonlyArray<TabItem<T>>;
  value: T | null;
  onChange: (id: T) => void;
  ariaLabel: string;
  modo?: "pestanas" | "filtro";
}) {
  const esTab = modo === "pestanas";
  return (
    <div className={s.tabs} role={esTab ? "tablist" : "group"} aria-label={ariaLabel}>
      {items.map(({ id, label, icon: Icon, count }) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            className={s.tab}
            {...(esTab ? { role: "tab", "aria-selected": on } : { "aria-pressed": on })}
            onClick={() => onChange(id)}
          >
            {Icon ? <Icon aria-hidden="true" /> : null}
            {label}
            {count != null ? <span className={s.count}>{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
