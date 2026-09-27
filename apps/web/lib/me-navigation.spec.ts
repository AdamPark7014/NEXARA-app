import { describe, expect, it } from "vitest";
import { filterModulesByNavigation, type MeNavigation } from "@/lib/me-navigation";

const modulos = [
  { id: "dashboard", panel: "erp", path: "/dashboard" },
  { id: "invoicing", panel: "erp", path: "/invoicing" },
  { id: "employee-payments", panel: "finance", routePanel: "erp", path: "/finance/employee-payments" },
  { id: "erp-pagos-empleados", panel: "erp", path: "/finance/employee-payments" },
];

function nav(parcial: Partial<MeNavigation>): MeNavigation {
  return {
    roleKey: "contabilidad",
    orgRoleKey: null,
    panels: ["erp"],
    paths: [],
    moduleKeys: [],
    webModuleIds: [],
    ...parcial,
  };
}

describe("filterModulesByNavigation · módulos ocultos por la empresa", () => {
  it("un comodín de ruta abriría Pagos a personal; hiddenModuleIds lo gana", () => {
    // Contabilidad tiene `/erp/finance/**`: sin la política, la ruta abre el módulo.
    const sinPolitica = filterModulesByNavigation(
      modulos,
      nav({ paths: ["/erp/dashboard", "/erp/invoicing/**", "/erp/finance/**"], webModuleIds: ["dashboard", "invoicing"] }),
    ).map((m) => m.id);
    expect(sinPolitica).toContain("employee-payments");

    const conPolitica = filterModulesByNavigation(
      modulos,
      nav({
        paths: ["/erp/dashboard", "/erp/invoicing/**", "/erp/finance/**"],
        webModuleIds: ["dashboard", "invoicing"],
        hiddenModuleIds: ["employee-payments", "erp-pagos-empleados"],
      }),
    ).map((m) => m.id);
    expect(conPolitica).toEqual(["dashboard", "invoicing"]);
  });

  it("la facturación no se toca", () => {
    const ids = filterModulesByNavigation(
      modulos,
      nav({ webModuleIds: ["dashboard", "invoicing"], hiddenModuleIds: ["employee-payments"] }),
    ).map((m) => m.id);
    expect(ids).toContain("invoicing");
  });

  it("sin módulos ocultos todo sigue igual", () => {
    const base = nav({ webModuleIds: ["dashboard", "employee-payments"] });
    expect(filterModulesByNavigation(modulos, base).map((m) => m.id)).toEqual(
      filterModulesByNavigation(modulos, { ...base, hiddenModuleIds: [] }).map((m) => m.id),
    );
  });

  it("con la navegación vacía no clippea, pero igual respeta lo oculto", () => {
    const ids = filterModulesByNavigation(modulos, nav({ hiddenModuleIds: ["employee-payments"] })).map((m) => m.id);
    expect(ids).not.toContain("employee-payments");
    expect(ids).toContain("invoicing");
  });
});
