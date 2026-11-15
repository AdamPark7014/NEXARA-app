import { describe, expect, it } from "vitest";
import { presentSidebarGroups } from "./sidebar-presentation";

describe("Por estrenar (15-11)", () => {
  it("los módulos sin registros van al final, en su grupo", () => {
    const grupos = presentSidebarGroups(
      [
        { title: "Operación", items: [{ id: "pizarra" }, { id: "erp-almacen" }, { id: "documents" }] },
        { title: "Empresa", items: [{ id: "my-profile" }] },
      ],
      "erp",
      "ceo",
      new Set(["erp-almacen", "documents"]),
    );
    expect(grupos.map((g) => g.title).slice(-2)).toEqual(["Empresa", "Por estrenar"]);
    expect(grupos.at(-1)!.items.map((i) => i.id)).toEqual(["erp-almacen", "documents"]);
  });
});
