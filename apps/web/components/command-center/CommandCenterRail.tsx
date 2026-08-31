"use client";

import { useMemo } from "react";
import CrossPanelLink from "@/components/CrossPanelLink";
import { useUser } from "@/components/UserContext";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES, type RoleKey } from "@/lib/rbac/roles";

export type CommandWidget = {
  id: string;
  label: string;
  href: string;
  icon: string;
  hint?: string;
};

const WIDGETS: Record<string, CommandWidget[]> = {
  ceo: [
    { id: "executive", label: "Vista ejecutiva", href: "/erp/executive", icon: "📊", hint: "KPIs globales" },
    { id: "approvals", label: "Aprobaciones", href: "/erp/approvals", icon: "✅", hint: "Pendientes" },
    { id: "dispatch", label: "Despacho", href: "/ops/dispatch", icon: "🗺️", hint: "OT en campo" },
    { id: "crm-dash", label: "Pipeline", href: "/crm/dashboard", icon: "💼", hint: "Comercial" },
    { id: "notifications", label: "Notificaciones", href: "/erp/notifications-center", icon: "🔔" },
    { id: "feed", label: "Actividad reciente", href: "/erp/notifications-center?view=feed", icon: "📡", hint: "Feed global" },
  ],
  ops_manager: [
    { id: "dispatch", label: "Centro de despacho", href: "/ops/dispatch", icon: "🗺️" },
    { id: "ops-dash", label: "Hoy en OPS", href: "/ops/dashboard", icon: "🚀" },
    { id: "activities", label: "Todas las OT", href: "/ops/activities", icon: "📋" },
    { id: "gps", label: "GPS en vivo", href: "/ops/gps", icon: "📍" },
    { id: "noc", label: "NOC", href: "/ops/noc", icon: "📡" },
    { id: "support", label: "Soporte", href: "/ops/support", icon: "🎫" },
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
    { id: "clients", label: "Clientes 360", href: "/crm/clients", icon: "👥" },
    { id: "agenda", label: "Agenda", href: "/crm/agenda", icon: "📅" },
    { id: "crm-chat", label: "Chat comercial", href: "/crm/chat", icon: "💬" },
  ],
  default: [
    { id: "erp-dash", label: "Resumen ERP", href: "/erp/dashboard", icon: "🏠" },
    { id: "chat", label: "Chat", href: "/erp/chat", icon: "💬" },
    { id: "notifications", label: "Notificaciones", href: "/erp/notifications-center", icon: "🔔" },
  ],
};

function bucketForRole(role: RoleKey | null): string {
  if (!role) return "default";
  if (role === ROLES.CEO || role === ROLES.SUPER_ADMIN || role === ROLES.ARQUITECTO) return "ceo";
  if (
    role === ROLES.DIR_OPERACIONES ||
    role === ROLES.COORD_OPERACIONES ||
    role === ROLES.ING_SOPORTE
  ) {
    return "ops_manager";
  }
  if (role === ROLES.ING_CAMPO) return "field";
  if (
    role === ROLES.VENDEDOR ||
    role === ROLES.COORD_VENTAS ||
    role === ROLES.DIR_ADMIN
  ) {
    return "sales";
  }
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
 */
export function CommandCenterRail({
  panel = "all",
  extraWidgets = [],
}: {
  panel?: PanelFilter;
  extraWidgets?: CommandWidget[];
}) {
  const { user } = useUser();
  const widgets = useMemo(() => {
    const base = filterForPanel(getCommandWidgetsForUser(user), panel);
    const merged = [...extraWidgets, ...base];
    const seen = new Set<string>();
    return merged.filter((w) => {
      if (seen.has(w.id)) return false;
      seen.add(w.id);
      return true;
    });
  }, [user, panel, extraWidgets]);

  if (!widgets.length) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 16,
      }}
    >
      {widgets.map((w) => (
        <CrossPanelLink
          key={w.id}
          href={w.href}
          title={w.hint}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--surface-elevated, var(--bg-secondary))",
            color: "var(--text-primary)",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
            transition: "border-color 0.15s",
          }}
        >
          <span aria-hidden>{w.icon}</span>
          <span>{w.label}</span>
        </CrossPanelLink>
      ))}
    </div>
  );
}
