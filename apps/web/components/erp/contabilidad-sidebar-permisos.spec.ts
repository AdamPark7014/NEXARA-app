/**
 * El menú del hub contable no debe ofrecer puertas que la API cierra con 403.
 *
 * Esto NO sustituye a la autorización —esa vive en `RbacGuard`/`UrlAccessGuard` y se prueba en
 * `apps/api/src/common/rbac/contabilidad-rbac.spec.ts`—, pero sí evita enseñarle a cada puesto
 * módulos que no son suyos.
 */
import { describe, expect, it } from "vitest";
import { filtrarGruposContabilidad } from "./ContabilidadSidebar";
import { PERMISSIONS, type UserPermissions } from "@/lib/permissions";

function idsVisibles(user: UserPermissions | null): string[] {
  return filtrarGruposContabilidad(user).flatMap((g) => g.items.map((i) => i.id));
}

/** Permisos reales del rol `contabilidad` (ver `AuthService.addV2RolePermissions`). */
const CONTADORA: UserPermissions = {
  permissions: [
    PERMISSIONS.CONTABILIDAD_VIEW,
    PERMISSIONS.CONTABILIDAD_MANAGE,
    PERMISSIONS.ACCOUNTING_VIEW,
    PERMISSIONS.ACCOUNTING_MANAGE,
    PERMISSIONS.INVOICING_VIEW,
    PERMISSIONS.INVOICING_MANAGE,
    PERMISSIONS.BANKING_VIEW,
    PERMISSIONS.BANKING_MANAGE,
    PERMISSIONS.DOCUMENTS_VIEW,
    PERMISSIONS.COTIZACIONES_ACCESS,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.TOOLS_VIEW,
    PERMISSIONS.TOOLS_REQUEST,
  ],
};

/** Permisos reales del rol `rh`. */
const RH: UserPermissions = {
  permissions: [PERMISSIONS.HR_VIEW, PERMISSIONS.HR_MANAGE, PERMISSIONS.DOCUMENTS_VIEW],
};

/** Ingeniero de campo: nada financiero. */
const ING_CAMPO: UserPermissions = {
  permissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.EVIDENCES_CREATE, PERMISSIONS.TOOLS_REQUEST],
};

describe("menú del hub contable", () => {
  it("la contadora ve su trabajo: dinero, documentos, nómina y costos", () => {
    const ids = idsVisibles(CONTADORA);
    for (const id of [
      "home",
      "movimientos",
      "cxc",
      "cxp",
      "conciliacion",
      "facturas",
      "proveedores",
      "prenomina",
      "proyectos",
      "presupuestos",
      "reportes",
      "cierres",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("la contadora NO ve la bitácora: `GET /api/audit` exige audit.view y ella no lo tiene", () => {
    expect(idsVisibles(CONTADORA)).not.toContain("auditoria");
  });

  it("RH solo ve nómina, no la contabilidad", () => {
    // "Pagos al personal" salió de esta barra: apuntaba a /erp/finance/employee-payments,
    // que es un módulo propio y ya está en el menú izquierdo. Tener la misma entrada
    // en los dos sitios es lo que hacía que esta barra se leyera como un duplicado
    // del menú. No se pierde acceso, cambia de dónde se llega.
    const ids = idsVisibles(RH);
    expect(ids).toEqual(expect.arrayContaining(["prenomina"]));
    expect(ids).not.toContain("pagos");
    for (const id of ["home", "movimientos", "cxc", "cxp", "conciliacion", "facturas", "cierres"]) {
      expect(ids).not.toContain(id);
    }
  });

  it("un ingeniero de campo no ve ninguna entrada", () => {
    expect(idsVisibles(ING_CAMPO)).toHaveLength(0);
    expect(filtrarGruposContabilidad(ING_CAMPO)).toHaveLength(0);
  });

  it("sin sesión no se pinta nada", () => {
    expect(filtrarGruposContabilidad(null)).toHaveLength(0);
  });

  it("super admin lo ve todo, incluida la bitácora", () => {
    const ids = idsVisibles({ isSuperAdmin: true, permissions: [] });
    expect(ids).toContain("auditoria");
    expect(ids).toContain("cierres");
  });

  it("no quedan grupos vacíos con su encabezado colgando", () => {
    for (const user of [CONTADORA, RH, ING_CAMPO]) {
      for (const grupo of filtrarGruposContabilidad(user)) {
        expect(grupo.items.length).toBeGreaterThan(0);
      }
    }
  });
});
