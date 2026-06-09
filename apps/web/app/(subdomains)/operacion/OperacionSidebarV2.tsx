"use client";

/**
 * NEXARA · OperacionSidebarV2 (wrapper de compatibilidad)
 * -------------------------------------------------------
 * `apps/web/app/(subdomains)/operacion/layout.tsx` aún importa este archivo.
 * En la arquitectura canónica el panel de operaciones vive en
 * `/app/(panels)/ops/*` con `<AppShell panel="ops" />`, y `middleware.ts`
 * redirige `operacion.*` y `/operacion/*` hacia `/ops/*`.
 *
 * Mientras dura la migración, este wrapper provee el mismo componente
 * `<DynamicSidebar panel="ops" />` para que la ruta legacy no rompa el build.
 */
import { DynamicSidebar } from "@/components/rbac/DynamicSidebar";

export default function OperacionSidebarV2() {
  return <DynamicSidebar panel="ops" panelLabel="Operación" />;
}
