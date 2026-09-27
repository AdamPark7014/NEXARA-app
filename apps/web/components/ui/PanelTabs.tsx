"use client";

import { ReactNode, useRef, type KeyboardEvent } from "react";
import styles from "./PanelTabs.module.scss";

/**
 * NEXARA · PanelTabs
 * Pestañas densas con tokens del sistema. Teclado: ← → cambian de pestaña,
 * Inicio / Fin van a la primera / última. En teléfono se desplazan en una
 * fila en vez de partirse en dos renglones.
 * Uso en módulos ERP/OPS/CRM (estado local) — no confundir con TabBar de rutas.
 */

export type PanelTabItem<T extends string = string> = {
  key: T;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
};

export default function PanelTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel = "Secciones",
}: {
  tabs: PanelTabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  ariaLabel?: string;
}) {
  const listRef = useRef<HTMLElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const enabled = tabs.filter((t) => !t.disabled);
    if (enabled.length === 0) return;
    const current = enabled.findIndex((t) => t.key === value);
    let next = -1;
    if (e.key === "ArrowRight") next = (current + 1) % enabled.length;
    else if (e.key === "ArrowLeft") next = (current - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const key = enabled[next].key;
    onChange(key);
    listRef.current?.querySelector<HTMLElement>(`[data-tab-key="${CSS.escape(key)}"]`)?.focus();
  };

  // Si ninguna coincide con `value`, la primera habilitada recibe el Tab.
  const hasActive = tabs.some((t) => t.key === value && !t.disabled);
  const fallbackKey = hasActive ? null : tabs.find((t) => !t.disabled)?.key;

  return (
    <nav ref={listRef} role="tablist" aria-label={ariaLabel} className={styles.list} onKeyDown={onKeyDown}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active || t.key === fallbackKey ? 0 : -1}
            data-tab-key={t.key}
            data-active={active ? "true" : undefined}
            disabled={t.disabled}
            onClick={() => onChange(t.key)}
            className={styles.tab}
          >
            {t.label}
            {t.badge != null && t.badge !== "" && <span className={styles.badge}>{t.badge}</span>}
          </button>
        );
      })}
    </nav>
  );
}
