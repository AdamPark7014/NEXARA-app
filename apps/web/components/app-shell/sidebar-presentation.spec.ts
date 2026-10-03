import { describe, expect, it } from "vitest";
import { MODULES } from "@/lib/access-matrix";
import { CORE_OLA1_MODULE_IDS } from "@/lib/core-surface";
import { CORE_GROUP_ORDER, formatNavCount, presentSidebarGroups } from "./sidebar-presentation";

const g = (title: string, ids: string[]) => ({ title, items: ids.map((id) => ({ id })) });

describe("presentSidebarGroups", () => {
  it("ordena Core en Hoy · Clientes y obra · Recursos · Finanzas · Mi cuenta", () => {
    const out = presentSidebarGroups(
      [g("Mi cuenta", ["my-profile"]), g("Finanzas", ["erp-contabilidad"]), g("Recursos", ["erp-almacen"]), g("Clientes y obra", ["erp-clients"]), g("Hoy", ["pizarra"])],
      "erp",
    );
    expect(out.map((x) => x.title)).toEqual(["Hoy", "Clientes y obra", "Recursos", "Finanzas", "Mi cuenta"]);
  });

  it("acomoda «Hoy»: actividades antes que chat", () => {
    const [hoy] = presentSidebarGroups([g("Hoy", ["executive", "chat", "mis-actividades", "pizarra", "asistencias"])], "erp");
    expect(hoy.items.map((i) => i.id)).toEqual(["executive", "mis-actividades", "pizarra", "asistencias", "chat"]);
  });

  it("un grupo desconocido queda antes de «Mi cuenta» y no se pierde ningún módulo", () => {
    const out = presentSidebarGroups([g("Mi cuenta", ["my-profile"]), g("Otro", ["x"]), g("Hoy", ["pizarra"])], "erp");
    expect(out.map((x) => x.title)).toEqual(["Hoy", "Otro", "Mi cuenta"]);
    expect(out.flatMap((x) => x.items.map((i) => i.id)).sort()).toEqual(["my-profile", "pizarra", "x"]);
  });

  it("fuera de Core no toca el orden", () => {
    const input = [g("Pipeline", ["crm-dashboard"]), g("Mi cuenta", ["my-profile"])];
    expect(presentSidebarGroups(input, "crm")).toBe(input);
  });

  it("todo módulo de Core cae en un grupo del nuevo agrupado", () => {
    for (const id of CORE_OLA1_MODULE_IDS) {
      const m = MODULES[id as keyof typeof MODULES];
      expect(CORE_GROUP_ORDER, id).toContain(m.group);
    }
  });
});

describe("formatNavCount", () => {
  it("oculta el cero y recorta arriba de 99", () => {
    expect(formatNavCount(0)).toBeNull();
    expect(formatNavCount(undefined)).toBeNull();
    expect(formatNavCount(7)).toBe("7");
    expect(formatNavCount(140)).toBe("99+");
  });
});
