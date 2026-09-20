import { describe, expect, it } from "vitest";
import {
  canCreateToolLoan,
  canCreateToolLoanClient,
  canManageTools,
} from "@/lib/tools-access";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { ROLES } from "@/lib/rbac/roles";
import { PERMISSIONS } from "@/lib/permissions";

describe("tools-access (web mirror)", () => {
  it("solo Christian e Iván administran", () => {
    expect(canManageTools("gerencia@nexara.com.mx")).toBe(true);
    expect(canManageTools("administracion.ventas@nexara.com.mx")).toBe(true);
    expect(canManageTools("operaciones@nexara.com.mx")).toBe(false);
    expect(canManageTools("jose.ramirez@nexara.com.mx")).toBe(false);
  });

  it("solo José Antonio y David crean préstamos", () => {
    expect(canCreateToolLoan("jose.ramirez@nexara.com.mx")).toBe(true);
    expect(canCreateToolLoan("operaciones@nexara.com.mx")).toBe(true);
    expect(canCreateToolLoan("gerencia@nexara.com.mx")).toBe(false);
    expect(canCreateToolLoanClient("administracion.ventas@nexara.com.mx")).toBe(false);
  });
});

describe("getOpsTeamSectionConfig('tools') por email", () => {
  it("David (coord_operaciones) pide, no aprueba — sin chrome manage", () => {
    const cfg = getOpsTeamSectionConfig(
      {
        email: "operaciones@nexara.com.mx",
        roleKey: ROLES.COORD_OPERACIONES,
      },
      "tools",
    );
    expect(cfg.viewMode).toBe("execute");
    expect(cfg.canCreate).toBe(true);
    expect(cfg.canApprove).toBe(false);
  });

  it("Iván (ing_campo) aprueba vía email aunque el rol sea campo", () => {
    const cfg = getOpsTeamSectionConfig(
      {
        email: "administracion.ventas@nexara.com.mx",
        roleKey: ROLES.ING_CAMPO,
      },
      "tools",
    );
    expect(cfg.viewMode).toBe("manage");
    expect(cfg.canApprove).toBe(true);
    expect(cfg.canCreate).toBe(false);
  });

  it("Christian (ceo) manage por email", () => {
    const cfg = getOpsTeamSectionConfig(
      { email: "gerencia@nexara.com.mx", roleKey: ROLES.CEO },
      "tools",
    );
    expect(cfg.viewMode).toBe("manage");
    expect(cfg.canApprove).toBe(true);
  });

  it("TOOLS_MANAGE en JWT abre manage si el email no está en la lista", () => {
    const cfg = getOpsTeamSectionConfig(
      {
        email: "otro@nexara.com.mx",
        roleKey: ROLES.ING_CAMPO,
        permissions: [PERMISSIONS.TOOLS_MANAGE],
      },
      "tools",
    );
    expect(cfg.viewMode).toBe("manage");
    expect(cfg.canApprove).toBe(true);
  });

  it("campo genérico sin email de préstamo: execute read-only", () => {
    const cfg = getOpsTeamSectionConfig(
      { email: "tecnico@nexara.com.mx", roleKey: ROLES.ING_CAMPO },
      "tools",
    );
    expect(cfg.viewMode).toBe("execute");
    expect(cfg.canCreate).toBe(false);
    expect(cfg.canApprove).toBe(false);
  });
});
