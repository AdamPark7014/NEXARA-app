"use client";

/**
 * Breadcrumbs — migas de pan consistentes.
 *
 * Uso:
 *   <Breadcrumbs items={[
 *     { label: "Clientes", href: "/clients" },
 *     { label: client.name }
 *   ]} />
 *
 * El último item se renderiza sin link (página actual).
 */

import Link from "next/link";
import type { ReactNode } from "react";

export type BreadcrumbItem = {
  label: string;
  href?: string;
  icon?: ReactNode;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
};

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          const content = (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {item.icon}
              {item.label}
            </span>
          );
          return (
            <li key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  style={{ color: "var(--text-secondary)", textDecoration: "none" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--primary, #0ea5e9)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-secondary)")}
                >
                  {content}
                </Link>
              ) : (
                <span style={{ color: isLast ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: isLast ? 600 : 400 }}>
                  {content}
                </span>
              )}
              {!isLast && <span aria-hidden="true" style={{ opacity: 0.5 }}>/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
