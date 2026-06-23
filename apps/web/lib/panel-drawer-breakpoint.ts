/**
 * Debe coincidir con `@media (max-width: 900px)` en `app/(subdomains)/console/console.module.css`
 * para drawers laterales, overlay y `data-mobile` / `data-open` del sidebar de consola.
 * Mantener alineado con `apps/mobile/lib/panel-drawer-breakpoint.ts`.
 */
export const PANEL_DRAWER_BREAKPOINT_PX = 900;

export function isPanelDrawerViewport(width: number): boolean {
  return width <= PANEL_DRAWER_BREAKPOINT_PX;
}
