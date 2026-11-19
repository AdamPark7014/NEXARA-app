import { describe, expect, it } from "vitest";
import { puedeEditarActividad } from "./actividad-edicion";

describe("Editar en el detalle de la actividad (B3, 18-11-2026)", () => {
  it("ing_campo sin activities.manage ya no ve Editar", () => {
    expect(puedeEditarActividad({ roleKey: "ing_campo", permissions: ["activities.view", "evidences.create"] } as never)).toBe(false);
  });
  it("quien tiene activities.manage sí (Luis, Liz, coordinación)", () => {
    expect(puedeEditarActividad({ roleKey: "dir_operaciones", permissions: ["activities.manage"] } as never)).toBe(true);
    expect(puedeEditarActividad({ roleKey: "coord_admin", permissions: ["activities.manage"] } as never)).toBe(true);
  });
  it("super admin siempre; sin usuario nunca", () => {
    expect(puedeEditarActividad({ isSuperAdmin: true, permissions: [] } as never)).toBe(true);
    expect(puedeEditarActividad(null)).toBe(false);
  });
});
