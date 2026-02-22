"use client";
import { ReactNode, useEffect } from "react";

/**
 * Layout específico para subdominios de paneles
 * No incluye Header ni Footer del sitio público
 */
export default function SubdomainsLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Agregar clase al body para excluir el padding-top general
    document.body.classList.add('subdomain-layout');
    return () => {
      document.body.classList.remove('subdomain-layout');
    };
  }, []);

  return <>{children}</>;
}
