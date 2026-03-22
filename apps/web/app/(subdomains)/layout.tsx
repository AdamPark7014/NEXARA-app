import { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

/**
 * Layout específico para subdominios de paneles
 * No incluye Header ni Footer del sitio público
 */
export default function SubdomainsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
