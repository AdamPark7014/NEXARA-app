"use client";
import { ReactNode } from "react";
import "./theme-lock.css";

/**
 * Layout específico para subdominios de paneles
 * No incluye Header ni Footer del sitio público
 */
export default function SubdomainsLayout({ children }: { children: ReactNode }) {
  return <div className="subdomainsPaletteLock">{children}</div>;
}
