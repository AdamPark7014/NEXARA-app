import { describe, expect, it } from "vitest";
import {
  MAX_REQUISITOS,
  avanceChecklist,
  borradoresDesdeChecklist,
  claveRequisito,
  descripcionLibre,
  hayErroresRequisitos,
  requisitoVacio,
  validarRequisitos,
  type RequisitoBorrador,
  type RequisitoHerramienta,
} from "./herramientas-checklist";

function fila(parcial: Partial<RequisitoBorrador> & { key: string }): RequisitoBorrador {
  return { id: null, descripcion: "Escalera", cantidad: 1, ...parcial };
}

function requisito(
  parcial: Partial<RequisitoHerramienta> & { id: number; descripcion: string },
): RequisitoHerramienta {
  return {
    cantidad: 1,
    productId: null,
    producto: null,
    toolId: null,
    herramienta: null,
    check: null,
    ...parcial,
  };
}

const check = (ok: boolean, nota: string | null = null) => ({
  ok,
  nota,
  fotoUrl: null,
  at: "2026-09-18T15:00:00.000Z",
  por: { id: 7, nombre: "Carolina" },
});

describe("claveRequisito", () => {
  it("ignora acentos, mayúsculas y espacios de más", () => {
    expect(claveRequisito("  Multímetro   digital ")).toBe(claveRequisito("multimetro digital"));
    expect(claveRequisito("Ponchadora RJ45")).toBe("ponchadora rj45");
  });
});

describe("validarRequisitos", () => {
  it("una lista vacía no tiene errores", () => {
    expect(hayErroresRequisitos(validarRequisitos([]))).toBe(false);
  });

  it("pide descripción en cada fila", () => {
    const errores = validarRequisitos([fila({ key: "a", descripcion: "   " }), fila({ key: "b" })]);
    expect(errores.porFila.a).toMatch(/Escribe qué herramienta/);
    expect(errores.porFila.b).toBeUndefined();
    expect(hayErroresRequisitos(errores)).toBe(true);
  });

  it("no deja dos herramientas iguales aunque cambien acentos o mayúsculas", () => {
    const errores = validarRequisitos([
      fila({ key: "a", descripcion: "Multímetro" }),
      fila({ key: "b", descripcion: "  MULTIMETRO " }),
    ]);
    expect(errores.porFila.a).toBeUndefined();
    expect(errores.porFila.b).toMatch(/ya está en la lista/);
  });

  it("exige cantidad mayor a cero", () => {
    const errores = validarRequisitos([
      fila({ key: "a", descripcion: "Escalera", cantidad: 0 }),
      fila({ key: "b", descripcion: "Taladro", cantidad: -2 }),
      fila({ key: "c", descripcion: "Arnés", cantidad: Number.NaN }),
      fila({ key: "d", descripcion: "Pinzas", cantidad: 3 }),
    ]);
    expect(errores.porFila.a).toMatch(/mayor a cero/);
    expect(errores.porFila.b).toMatch(/mayor a cero/);
    expect(errores.porFila.c).toMatch(/mayor a cero/);
    expect(errores.porFila.d).toBeUndefined();
  });

  it("avisa cuando se pasa del máximo de la API", () => {
    const filas = Array.from({ length: MAX_REQUISITOS + 1 }, (_, i) =>
      fila({ key: `k${i}`, descripcion: `Herramienta ${i}` }),
    );
    const errores = validarRequisitos(filas);
    expect(errores.general).toMatch(new RegExp(`Máximo ${MAX_REQUISITOS} herramientas`));
    expect(hayErroresRequisitos(errores)).toBe(true);
    expect(validarRequisitos(filas.slice(0, MAX_REQUISITOS)).general).toBeNull();
  });
});

describe("avanceChecklist", () => {
  it("sin renglones el checklist está completo (no hay candado al iniciar)", () => {
    expect(avanceChecklist([])).toEqual({ total: 0, listos: 0, pendientes: [], completo: true });
  });

  it("marcar «falta o está dañado» sigue contando como pendiente", () => {
    const avance = avanceChecklist([
      requisito({ id: 1, descripcion: "Escalera", check: check(true) }),
      requisito({ id: 2, descripcion: "Taladro", check: check(false, "Sin batería") }),
      requisito({ id: 3, descripcion: "Arnés" }),
    ]);
    expect(avance).toEqual({ total: 3, listos: 1, pendientes: ["Taladro", "Arnés"], completo: false });
  });

  it("con todo palomeado en ok queda completo", () => {
    const avance = avanceChecklist([
      requisito({ id: 1, descripcion: "Escalera", check: check(true) }),
      requisito({ id: 2, descripcion: "Taladro", check: check(true) }),
    ]);
    expect(avance).toEqual({ total: 2, listos: 2, pendientes: [], completo: true });
  });
});

describe("descripcionLibre", () => {
  it("usa el nombre tal cual la primera vez y numera desde 2 después", () => {
    expect(descripcionLibre("Escalera", [])).toBe("Escalera");
    expect(descripcionLibre("Escalera", ["escalera"])).toBe("Escalera 2");
    expect(descripcionLibre("Escalera", ["Escalera", "Escalera 2"])).toBe("Escalera 3");
  });

  it("los acentos no se cuelan como nombre distinto", () => {
    expect(descripcionLibre("Multímetro", ["multimetro"])).toBe("Multímetro 2");
  });
});

describe("borradoresDesdeChecklist", () => {
  it("conserva id, descripción y cantidad, con llaves distintas por renglón", () => {
    const filas = borradoresDesdeChecklist([
      requisito({ id: 4, descripcion: "Escalera", cantidad: 2, check: check(true) }),
      requisito({ id: 9, descripcion: "Taladro con brocas" }),
    ]);
    expect(filas.map((f) => [f.id, f.descripcion, f.cantidad])).toEqual([
      [4, "Escalera", 2],
      [9, "Taladro con brocas", 1],
    ]);
    expect(new Set(filas.map((f) => f.key)).size).toBe(2);
  });

  it("una lista vacía da un borrador vacío", () => {
    expect(borradoresDesdeChecklist([])).toEqual([]);
  });
});

describe("requisitoVacio", () => {
  it("genera llaves distintas y arranca en cantidad 1", () => {
    const a = requisitoVacio();
    const b = requisitoVacio("Escalera", 3);
    expect(a.key).not.toBe(b.key);
    expect([a.descripcion, a.cantidad]).toEqual(["", 1]);
    expect([b.descripcion, b.cantidad]).toEqual(["Escalera", 3]);
  });
});
