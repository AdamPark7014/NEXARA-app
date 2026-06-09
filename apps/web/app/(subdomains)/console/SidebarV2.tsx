"use client";

/**
 * NEXARA · SidebarV2 (wrapper de compatibilidad)
 * ----------------------------------------------
 * Mantiene compatibilidad con `apps/web/app/(subdomains)/console/layout.tsx`
 * que aún importa `./SidebarV2`.
 *
 * En la nueva arquitectura el subdominio canónico de ERP es `core` y se
 * sirve desde `/app/(panels)/erp/*` con `<AppShell panel="erp" />`. Las
 * rutas legacy `/console/*` y los hostnames legacy ya redirigen ahí desde
 * `middleware.ts`, por lo que este wrapper solo se monta cuando alguien
 * entra por la ruta vieja durante la transición.
 *
 * Reusa `<DynamicSidebar panel="core" />` (RBAC v2) para no duplicar
 * lógica con el panel canónico.
 */
import { DynamicSidebar } from "@/components/rbac/DynamicSidebar";

export default function SidebarV2() {
  return <DynamicSidebar panel="core" panelLabel="Consola" />;
}
