"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import s from "./base.module.css";

/**
 * Encabezado de página: título 20 px, una línea de descripción, acciones a la derecha
 * y, si hay, pestañas debajo. Es el mismo en todos los módulos del panel.
 */
export function PageHead({
  title,
  description,
  actions,
  back,
  meta,
  tabs,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Enlace chico arriba del título («← Asistencias»). */
  back?: { href: string; label: string };
  /** Insignias o datos cortos debajo de la descripción. */
  meta?: ReactNode;
  /** Pestañas (<Tabs/>) pegadas al borde inferior del encabezado. */
  tabs?: ReactNode;
}) {
  return (
    <header className={s.head}>
      <div className={s.headTop}>
        <div className={s.headText}>
          {back ? (
            <Link href={back.href} className={s.headBack}>
              ← {back.label}
            </Link>
          ) : null}
          <h1 className={s.headTitle}>{title}</h1>
          {description ? <p className={s.headDesc}>{description}</p> : null}
          {meta ? <div className={s.headMeta}>{meta}</div> : null}
        </div>
        {actions ? <div className={s.headActions}>{actions}</div> : null}
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
