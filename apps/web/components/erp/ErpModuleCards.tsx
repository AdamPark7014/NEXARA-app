"use client";

import Link from "next/link";
import chrome from "./erp-chrome.module.css";

export type ErpModuleCardItem = {
  href: string;
  title: string;
  description: string;
  icon?: string;
  cta?: string;
};

/** Tarjetas densas de acceso a módulos — dashboard / hub, no marketing. */
export default function ErpModuleCards({ items }: { items: ErpModuleCardItem[] }) {
  if (!items.length) return null;
  return (
    <div className={chrome.moduleGrid}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={chrome.moduleCard}>
          {item.icon ? <span className={chrome.moduleCardIcon} aria-hidden="true">{item.icon}</span> : null}
          <span className={chrome.moduleCardTitle}>{item.title}</span>
          <span className={chrome.moduleCardDesc}>{item.description}</span>
          <span className={chrome.moduleCardCta}>{item.cta ?? "Abrir →"}</span>
        </Link>
      ))}
    </div>
  );
}
