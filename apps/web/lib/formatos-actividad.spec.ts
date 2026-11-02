import { describe, expect, it } from "vitest";
import {
  FORMATOS_VISIBLES_DESDE,
  ajustarCantidad,
  faltanteParaAsignar,
  formatosVisibles,
  hoyMx,
  jornadasDe,
  minutosDeRenglon,
  puedeVerFormatos,
  renglonesParaAplicar,
  resumenEvidencia,
  siguienteDiaLaboral,
  type RecetaFormato,
} from "./formatos-actividad";

const receta: RecetaFormato = {
  unidad: "Cámaras",
  cantidadPorOmision: 4,
  renglones: [
    { titulo: "Levantamiento", coreKind: "tarea", tipo: "Levantamiento", minutosBase: 60, minutosPorUnidad: 0, fotos: 4, indicaciones: null, puntos: [], herramientas: [] },
    { titulo: "Montaje", coreKind: "tarea", tipo: "Instalación", minutosBase: 30, minutosPorUnidad: 45, fotos: 4, indicaciones: null, puntos: [{ nombre: "Rack", momentos: ["DESPUES"] }], herramientas: [] },
  ],
};

describe("minutos", () => {
  it("base más lo que suma cada unidad, nunca menos de 5", () => {
    expect(minutosDeRenglon(receta.renglones[1], 4)).toBe(210);
    expect(minutosDeRenglon({ minutosBase: 0, minutosPorUnidad: 45 }, 0)).toBe(5);
  });

  it("cambiar la cantidad recalcula, salvo lo escrito a mano", () => {
    const [a, b] = renglonesParaAplicar(receta, 4);
    expect([a.minutos, b.minutos]).toEqual([60, 210]);
    const [, recalculado] = ajustarCantidad([a, b], 6);
    expect(recalculado.minutos).toBe(300);
    const [, aMano] = ajustarCantidad([a, { ...b, minutos: 100, minutosEditado: true }], 6);
    expect(aMano.minutos).toBe(100);
  });

  it("cada renglón tiene su propia clave", () => {
    const [a, b] = renglonesParaAplicar(receta, 4);
    expect(a.clave).not.toBe(b.clave);
  });
});

describe("textos", () => {
  it("la evidencia se nombra si tiene puntos; si no, se cuentan las fotos", () => {
    expect(resumenEvidencia(receta.renglones[0])).toBe("4 fotos");
    expect(resumenEvidencia(receta.renglones[1])).toBe("Rack");
  });

  it("jornadas de 7 horas útiles", () => {
    expect(jornadasDe(30)).toBe(1);
    expect(jornadasDe(420)).toBe(1);
    expect(jornadasDe(421)).toBe(2);
  });
});

describe("fechas de México", () => {
  it("mañana en un martes", () => {
    expect(siguienteDiaLaboral(new Date("2026-11-10T18:00:00Z"))).toBe("2026-11-11");
  });
  it("el viernes salta al lunes", () => {
    expect(siguienteDiaLaboral(new Date("2026-11-13T18:00:00Z"))).toBe("2026-11-16");
  });
  it("de noche todavía es el mismo día en México", () => {
    expect(hoyMx(new Date("2026-11-11T03:00:00Z"))).toBe("2026-11-10");
    expect(siguienteDiaLaboral(new Date("2026-11-14T03:00:00Z"))).toBe("2026-11-16");
  });
});

describe("lo que falta para asignar", () => {
  const base = { responsableId: "9", fecha: "2026-11-10", clienteId: null, proyectoId: null, renglones: receta.renglones };

  it("listo", () => expect(faltanteParaAsignar(base)).toBeNull());
  it("persona", () => expect(faltanteParaAsignar({ ...base, responsableId: "" })).toBe("Elige quién la lleva"));
  it("título", () =>
    expect(faltanteParaAsignar({ ...base, renglones: [{ titulo: " ", coreKind: "tarea" }] })).toContain("título"));
  it("servicio sin cliente", () => {
    const renglones = [{ titulo: "x", coreKind: "servicio" as const }];
    expect(faltanteParaAsignar({ ...base, renglones })).toContain("cliente");
    expect(faltanteParaAsignar({ ...base, renglones, clienteId: 3 })).toBeNull();
    expect(faltanteParaAsignar({ ...base, renglones, proyectoId: 3 })).toBeNull();
  });
});

describe("acceso", () => {
  it("se publica el viernes 6 de noviembre a las 6:00 de México", () => {
    expect(formatosVisibles(FORMATOS_VISIBLES_DESDE - 1)).toBe(false);
    expect(formatosVisibles(Date.parse("2026-11-06T06:00:00-06:00"))).toBe(true);
  });
  it("lo ven quienes asignan a otros", () => {
    expect(puedeVerFormatos("coord_operaciones")).toBe(true);
    expect(puedeVerFormatos("enc_soporte")).toBe(true);
    expect(puedeVerFormatos("ing_campo")).toBe(false);
    expect(puedeVerFormatos("ing_campo", { isSuperAdmin: true })).toBe(true);
    expect(puedeVerFormatos("ing_soporte", { permissions: ["activities.manage"] })).toBe(true);
    expect(puedeVerFormatos("ing_soporte", { permissions: ["activities.view"] })).toBe(false);
    expect(puedeVerFormatos(null)).toBe(false);
  });
});
