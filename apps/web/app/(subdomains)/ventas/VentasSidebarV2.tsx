"use client";

/**
 * NEXARA · VentasSidebarV2 (wrapper de compatibilidad)
 * ----------------------------------------------------
 * `apps/web/app/(subdomains)/ventas/layout.tsx` aún importa este archivo.
 * En la arquitectura canónica el panel comercial vive en
 * `/app/(panels)/crm/*` con `<AppShell panel="crm" />`, y `middleware.ts`
 * redirige `ventas.*` y `/ventas/*` hacia `/crm/*`.
 *
 * Este wrapper mantiene la ruta legacy compilable durante la transición.
 */
import { DynamicSidebar } from "@/components/rbac/DynamicSidebar";

export default function VentasSidebarV2() {
  return <DynamicSidebar panel="sales" panelLabel="Ventas" />;
}
