"use client";
import { ReactNode } from "react";

/**
 * Layout específico para subdominios de paneles
 * No incluye Header ni Footer del sitio público
 */
export default function SubdomainsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
