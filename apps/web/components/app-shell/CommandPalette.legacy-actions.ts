/**
 * Acciones del CommandPalette fuera de Core ola1.
 *
 * Se mantienen como catálogo reciclable (CRM / OPS / multi-panel).
 * NO se cablean cuando `CORE_SURFACE_ONLY` — ver CommandPalette.tsx.
 */
import type { PanelId } from "@/lib/access-matrix";
import { PANEL_META } from "@/lib/access-matrix";
import { buildCrossPanelUrl, resolveCrossPanelHref, detectCurrentPanelId } from "@/lib/cross-panel-handoff";
import { getUserAllowedPanels, getUserPanelSwitchPath, type UserAccessInput } from "@/lib/user-access";

export type PaletteActionDraft = {
  id: string;
  label: string;
  description?: string;
  icon: string;
  group: string;
  panel?: PanelId;
  url?: string;
  keywords?: string[];
};

/** Crear lead / cotización / ticket — solo paneles CRM·OPS. */
export function buildLegacyCreateActions(
  user: UserAccessInput | null,
): PaletteActionDraft[] {
  const userJson = user ? JSON.stringify(user) : null;
  const current = detectCurrentPanelId();
  const toUrl = (path: string) => resolveCrossPanelHref(path, userJson, current);
  return [
    {
      id: "act:create-lead",
      label: "Crear lead",
      description: "Nuevo prospecto en CRM",
      icon: "🌱",
      group: "Crear",
      url: toUrl("/crm/leads"),
      keywords: ["nuevo", "prospecto", "lead"],
    },
    {
      id: "act:create-quote",
      label: "Crear cotización",
      description: "Nueva cotización comercial",
      icon: "📄",
      group: "Crear",
      url: toUrl("/crm/quotes"),
      keywords: ["cotizacion", "quote", "nuevo"],
    },
    {
      id: "act:create-ticket",
      label: "Crear ticket de soporte",
      description: "Bandeja OPS · soporte",
      icon: "🎫",
      group: "Crear",
      url: toUrl("/ops/support"),
      keywords: ["ticket", "soporte", "incidencia"],
    },
  ];
}

/** Saltos multi-panel (CRM, OPS, Studio…). */
export function buildLegacyPanelJumpActions(
  user: UserAccessInput | null,
): PaletteActionDraft[] {
  const userJson = user ? JSON.stringify(user) : null;
  return getUserAllowedPanels(user).map((p) => ({
    id: `panel:${p.id}`,
    label: `Ir a ${p.name}`,
    description: p.tagline,
    icon: p.icon,
    group: "Saltar a panel",
    panel: p.id,
    url: buildCrossPanelUrl(p.id, getUserPanelSwitchPath(user, p.id), userJson),
    keywords: [p.id, p.publicSubdomain],
  }));
}

/** Referencia rápida de paneles (por si se re-cablea el switcher). */
export const LEGACY_PANEL_META_SNAPSHOT = PANEL_META;
