"use client";

import { ReactNode } from "react";
import CrossPanelLink from "@/components/CrossPanelLink";
import styles from "./ContextRail.module.css";

/**
 * NEXARA · ContextRail
 * Fila de submódulos: las mismas pestañas con raya del resto de Core.
 */

export type ContextRailItem = {
  id: string;
  label: ReactNode;
  href?: string;
  active?: boolean;
  onClick?: () => void;
};

export default function ContextRail({
  items,
  ariaLabel = "Contexto",
}: {
  items: ContextRailItem[];
  ariaLabel?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={styles.rail}>
      {items.map((item) => {
        const clase = [styles.item, item.onClick || item.href ? "" : styles.fijo].filter(Boolean).join(" ");
        if (item.href) {
          return (
            <CrossPanelLink
              key={item.id}
              href={item.href}
              className={clase}
              data-active={item.active ? "true" : undefined}
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
            </CrossPanelLink>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            className={clase}
            data-active={item.active ? "true" : undefined}
            aria-pressed={item.active}
            onClick={item.onClick}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
