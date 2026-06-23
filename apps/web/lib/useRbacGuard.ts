/**
 * NEXARA · useRbacGuard
 * =====================
 * Hook que expone capacidades CRUD para el usuario actual, basándose
 * en su orgRoleKey y nivelAutoridad. Úsalo en cualquier página para
 * mostrar/ocultar botones de forma jerárquica.
 *
 * Jerarquía de nivelAutoridad:
 *   5  CEO / SuperAdmin  → todo
 *   4  Director (Admin, Ops, Comercial)
 *   3  PM / Arquitecto / Coordinador / Gerente Ventas
 *   2  Field Engineer / Sales Rep / Designer / Support
 *   1  Viewer / externo
 *   0  Sin rol asignado
 */
"use client";

import { useMemo } from "react";
import { useUser } from "@/components/UserContext";
import { resolveOrgRoleKey } from "@/lib/org-roles";

export interface RbacGuard {
  /** Puede crear registros nuevos */
  canCreate: boolean;
  /** Puede editar cualquier registro (no solo el propio) */
  canEdit: boolean;
  /** Puede editar solo sus propios registros */
  canEditOwn: boolean;
  /** Puede eliminar registros */
  canDelete: boolean;
  /** Puede aprobar flujos (viáticos, evidencias, compras…) */
  canApprove: boolean;
  /** Puede gestionar usuarios (crear, editar rol, resetear contraseña) */
  canManageUsers: boolean;
  /** Puede ver reportes y datos de todo el equipo */
  canViewAll: boolean;
  /** Es CEO o SuperAdmin */
  isCeo: boolean;
  /** Es director de cualquier área */
  isDirector: boolean;
  /** nivelAutoridad numérico del usuario */
  nivel: number;
  /** orgRoleKey resuelto */
  orgRoleKey: string | null;
}

export function useRbacGuard(): RbacGuard {
  const { user } = useUser();

  return useMemo<RbacGuard>(() => {
    if (!user) {
      return {
        canCreate: false, canEdit: false, canEditOwn: false, canDelete: false,
        canApprove: false, canManageUsers: false, canViewAll: false,
        isCeo: false, isDirector: false, nivel: 0, orgRoleKey: null,
      };
    }

    const nivel = user.nivelAutoridad ?? 0;
    const orgKey = resolveOrgRoleKey(user.role ?? "", user.orgRoleKey) ?? null;
    const isSuperAdmin = Boolean(user.isSuperAdmin);
    const isCeo = isSuperAdmin || nivel >= 5 || orgKey === "ceo";

    const DIRECTORS = new Set(["director_ops", "director_admin", "director_commercial"]);
    const MANAGERS  = new Set(["project_manager", "arquitecto", "sales_manager"]);

    const isDirector = isCeo || DIRECTORS.has(orgKey ?? "") || nivel >= 4;
    const isManager  = isDirector || MANAGERS.has(orgKey ?? "") || nivel >= 3;

    return {
      canCreate:      nivel >= 2 || isManager,
      canEdit:        isManager,
      canEditOwn:     nivel >= 2,
      canDelete:      isDirector,
      canApprove:     isManager,
      canManageUsers: isCeo || orgKey === "director_admin",
      canViewAll:     isManager,
      isCeo,
      isDirector,
      nivel,
      orgRoleKey: orgKey,
    };
  }, [user]);
}
