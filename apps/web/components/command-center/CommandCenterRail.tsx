"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import CrossPanelLink from "@/components/CrossPanelLink";
import { useUser } from "@/components/UserContext";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES, type RoleKey } from "@/lib/rbac/roles";
import styles from "./CommandCenterRail.module.css";

export type CommandWidget = {
  id: string;
  label: string;
  href: string;
  icon: string;
  hint?: string;
  /** Resalta el acceso como algo que requiere atención. */
  alert?: boolean;
};

const WIDGETS: Record<string, CommandWidget[]> = {
  ceo: [
    { id: "executive", label: "Vista ejecutiva", href: "/erp/executive", icon: "📊", hint: "Indicadores clave" },
    { id: "approvals", label: "Aprobaciones", href: "/erp/approvals", icon: "✅", hint: "Pendientes" },
    { id: "dispatch", label: "Despacho", href: "/ops/dispatch", icon: "🗺️", hint: "OT en campo" },
    { id: "crm-dash", label: "Pipeline", href: "/crm/dashboard", icon: "💼", hint: "Comercial" },
    { id: "notifications", label: "Notificaciones", href: "/erp/notifications-center", icon: "🔔" },
    { id: "feed", label: "Actividad reciente", href: "/erp/notifications-center?view=feed", icon: "📡" },
  ],
  ops_manager: [
    { id: "dispatch", label: "Centro de despacho", href: "/ops/dispatch", icon: "🗺️" },
    { id: "ops-dash", label: "Hoy en OPS", href: "/ops/dashboard", icon: "🚀" },
    { id: "activities", label: "Todas las OT", href: "/ops/activities", icon: "📋" },
    { id: "sla", label: "SLA", href: "/ops/support/sla", icon: "⏱️", hint: "Cumplimiento" },
    { id: "support", label: "Soporte", href: "/ops/support", icon: "🎫" },
    { id: "notifications", label: "Notificaciones", href: "/ops/notifications-center", icon: "🔔" },
  ],
  field: [
    { id: "my-activities", label: "Mis OT", href: "/ops/my-activities", icon: "🧰" },
    { id: "my-evidences", label: "Mis evidencias", href: "/ops/my-evidences", icon: "📷" },
    { id: "my-viatics", label: "Mis viáticos", href: "/ops/my-viatics", icon: "💸" },
    { id: "tools", label: "Herramientas", href: "/ops/tools", icon: "🛠️" },
    { id: "chat", label: "Chat equipo", href: "/ops/chat", icon: "💬" },
  ],
  sales: [
    { id: "crm-dash", label: "Mi pipeline", href: "/crm/dashboard", icon: "💼" },
    { id: "quotes", label: "Cotizaciones", href: "/crm/quotes", icon: "📄" },
    { id: "smart-quote", label: "Cotizador inteligente", href: "/crm/quotes/nueva", icon: "✨" },
    { id: "agenda", label: "Agenda", href: "/crm/agenda", icon: "📅" },
    { id: "notifications", label: "Notificaciones", href: "/crm/notifications-center", icon: "🔔" },
    { id: "crm-chat", label: "Chat comercial", href: "/crm/chat", icon: "💬" },
  ],
  default: [
    { id: "erp-dash", label: "Resumen general", href: "/erp/dashboard", icon: "🏠" },
    { id: "chat", label: "Chat", href: "/erp/chat", icon: "💬" },
    { id: "notifications", label: "Notificaciones", href: "/erp/notifications-center", icon: "🔔" },
  ],
};

function bucketForRole(role: RoleKey | null): string {
  if (!role) return "default";
  if (role === ROLES.CEO || role === ROLES.SUPER_ADMIN || role === ROLES.ARQUITECTO) return "ceo";
  if (role === ROLES.DIR_OPERACIONES || role === ROLES.COORD_OPERACIONES || role === ROLES.ING_SOPORTE) {
    return "ops_manager";
  }
  if (role === ROLES.ING_CAMPO) return "field";
  if (role === ROLES.VENDEDOR || role === ROLES.COORD_VENTAS || role === ROLES.DIR_ADMIN) return "sales";
  return "default";
}

export function getCommandWidgetsForUser(
  user: { roleKey?: string | null; role?: string | null; orgRoleKey?: string | null; isSuperAdmin?: boolean } | null | undefined,
): CommandWidget[] {
  const role = resolveV2RoleKey(user);
  return WIDGETS[bucketForRole(role)] ?? WIDGETS.default;
}

type PanelFilter = "ops" | "crm" | "erp" | "all";

function filterForPanel(widgets: CommandWidget[], panel: PanelFilter): CommandWidget[] {
  if (panel === "all") return widgets;
  const prefix = `/${panel}/`;
  return widgets.filter((w) => w.href.startsWith(prefix));
}

/**
 * Rail de accesos rápidos según rol — Command Center ligero en dashboards.
 * Omite el acceso a la pantalla actual.
 */
export function CommandCenterRail({
  panel = "all",
  extraWidgets = [],
  ariaLabel = "Accesos directos",
}: {
  panel?: PanelFilter;
  extraWidgets?: CommandWidget[];
  ariaLabel?: string;
}) {
  const { user } = useUser();
  const pathname = usePathname();
  const widgets = useMemo(() => {
    const base = filterForPanel(getCommandWidgetsForUser(user), panel);
    const seen = new Set<string>();
    return [...extraWidgets, ...base].filter((w) => {
      if (seen.has(w.id) || w.href === pathname) return false;
      seen.add(w.id);
      return true;
    });
  }, [user, panel, extraWidgets, pathname]);

  if (!widgets.length) return null;

  return (
    <nav aria-label={ariaLabel} className={styles.rail}>
      {widgets.map((w) => (
        <CrossPanelLink
          key={w.id}
          href={w.href}
          className={`${styles.chip} ${w.alert ? styles.alert : ""}`}
        >
          <span aria-hidden="true">{w.icon}</span>
          <span>{w.label}</span>
          {w.hint && <span className={styles.hint}>{w.hint}</span>}
        </CrossPanelLink>
      ))}
    </nav>
  );
}
