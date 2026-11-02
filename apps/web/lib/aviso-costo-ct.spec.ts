import { describe, expect, it } from "vitest";
import { avisoDeSugerencia, crearAviso, leerAviso, type AvisoCt, type LecturaAviso } from "./aviso-costo-ct";
import { partidaNueva, partidasParaApi } from "./cotizacion-documento";
import type { CostoDeHoy } from "./cotizaciones-api";

const hoy = (cambios: Partial<CostoDeHoy>): CostoDeHoy => ({ costo: 3400, diferencia: 0.1333, piezas: 9, clave: "SWT1", alDia: true, fecha: "2026-11-02T17:00:00.000Z", ...cambios });

const SWITCH = crearAviso(hoy({}), 3000, 3300)!;
const ACCESS = crearAviso(hoy({ costo: 4800, diferencia: -0.2, piezas: 6 }), 6000, 6000)!;
const DISCO = crearAviso(hoy({ costo: 11000, diferencia: 0.1, piezas: 0 }), 10000, 12000)!;

const leer = (aviso: AvisoCt, unitCost: number, unitPrice: number, extra: Partial<Parameters<typeof leerAviso>[0]> = {}) =>
  leerAviso({ aviso, unitCost, unitPrice, moneda: "MXN", margenBase: 20, rotuloBase: ", el de la tarjeta", ...extra })!;

const texto = (l: LecturaAviso) => l.renglones.map((r) => r.map((p) => [p.texto, p.cifra].filter(Boolean).join(" ")).join(" · "));

describe("crearAviso", () => {
  it("sin costo guardado no hay aviso", () => {
    expect(crearAviso(hoy({}), null, 100)).toBeNull();
    expect(crearAviso(hoy({}), 0, 100)).toBeNull();
    expect(crearAviso(undefined, 100, 120)).toBeNull();
  });

  it("recuerda el margen de la última vez, salvo que se guardó con el costo igual al precio", () => {
    expect(SWITCH.margenUltimaVez).toBe(10);
    expect(DISCO.margenUltimaVez).toBe(20);
    expect(ACCESS.margenUltimaVez).toBeNull();
  });

  it("si la persona ya escribió otro precio, ese es al que se regresa; el margen sigue siendo el de la última vez", () => {
    expect(crearAviso(hoy({}), 3000, 5000, 3300)).toMatchObject({ precioGuardado: 5000, margenUltimaVez: 10 });
  });
});

describe("leerAviso", () => {
  it("el precio ya no cubre el costo de hoy: rojo y dice cuánto se pierde", () => {
    const l = leer(SWITCH, 3000, 3300);
    expect(l.tono).toBe("rojo");
    expect(texto(l)).toEqual(["Hoy en CT $3,400.00 · 13 % más que el costo guardado ($3,000.00) · 9 en stock", "A este precio pierdes $100.00 por pieza"]);
    expect(l).toMatchObject({ usar: "Usar costo de hoy", subir: null, deshacer: false });
  });

  it("CT más barato con costo igual al precio: lo dice y no ofrece bajar el precio", () => {
    const l = leer(ACCESS, 6000, 6000);
    expect(l.tono).toBe("azul");
    expect(texto(l)).toEqual(["Hoy en CT $4,800.00 · 20 % menos que el costo guardado ($6,000.00, igual a su precio) · 6 en stock", "A este precio ganas 25 %"]);
    const conCosto = leer(ACCESS, 4800, 6000);
    expect(conCosto.subir).toBeNull();
    expect(conCosto.deshacer).toBe(true);
  });

  it("baja lo que se gana: ámbar, con el margen de la última vez y «sobre pedido» si no hay piezas", () => {
    const l = leer(DISCO, 10000, 12000);
    expect(l.tono).toBe("ambar");
    expect(texto(l)).toEqual(["Hoy en CT $11,000.00 · 10 % más que el costo guardado ($10,000.00) · sobre pedido", "A este precio ganas 9.1 % · la última vez 20 %"]);
  });

  it("con el costo de hoy puesto ofrece subir el precio al margen de la última vez", () => {
    const l = leer(SWITCH, 3400, 3300);
    expect(l.usar).toBeNull();
    expect(texto(l)[0]).toBe("Costo de hoy $3,400.00 · antes $3,000.00");
    expect(l.subir).toEqual({ precio: 3740, margen: 10, texto: "Subir precio a $3,740.00 · 10 %, como la última vez" });
  });

  it("lo que se guardó sin margen sube con el margen base, y lo dice", () => {
    const aviso = crearAviso(hoy({ costo: 40, diferencia: 3, piezas: 0 }), 10, 10)!;
    expect(leer(aviso, 40, 10).subir).toEqual({ precio: 48, margen: 20, texto: "Subir precio a $48.00 · 20 %, el de la tarjeta" });
  });

  it("sin margen base no inventa uno", () => {
    const aviso = crearAviso(hoy({ costo: 40, diferencia: 3, piezas: 0 }), 10, 10)!;
    expect(leer(aviso, 40, 10, { margenBase: null }).subir).toBeNull();
  });

  it("con el precio ya subido queda en verde y dice qué cambió", () => {
    const l = leer(SWITCH, 3400, 3740);
    expect(l.tono).toBe("verde");
    expect(texto(l)).toEqual(["Costo de hoy $3,400.00 · antes $3,000.00", "Precio $3,740.00 · antes $3,300.00"]);
    expect(l).toMatchObject({ subir: null, usar: null, deshacer: true });
  });

  it("un precio escrito a mano se lee sin más: el aviso nunca contradice lo que se ve", () => {
    expect(texto(leer(SWITCH, 3000, 5000))[1]).toBe("A este precio ganas 47.1 % · la última vez 10 %");
    expect(leer(SWITCH, 3000, 0).renglones[1]).toEqual([{ texto: "Falta el precio" }]);
  });

  it("si escribió otro costo ya lo resolvió: no estorba", () => {
    expect(leerAviso({ aviso: SWITCH, unitCost: 3200, unitPrice: 3300, moneda: "MXN", margenBase: 20, rotuloBase: "" })).toBeNull();
  });

  it("el descuento de la fila y el margen general cambian lo que de verdad se cobra", () => {
    const conGeneral = leer(SWITCH, 3000, 3300, { margenGeneral: 20 });
    expect(texto(conGeneral)[1]).toBe("Con el 20 % general ganas 16.5 % · la última vez 10 %");
    expect(conGeneral.tono).toBe("azul");
    expect(texto(leer(DISCO, 10000, 12000, { descuento: 10 }))[1]).toBe("A este precio pierdes $200.00 por pieza");
  });

  it("si CT no sincronizó en 24 horas no dice «hoy»", () => {
    const viejo = crearAviso(hoy({ alDia: false }), 3000, 3300)!;
    const l = leer(viejo, 3000, 3300);
    expect(texto(l)[0]).toMatch(/^CT al 02 nov/);
    expect(l.usar).toBe("Usar costo de CT");
    expect(texto(leer(viejo, 3400, 3300))[0]).toBe("Costo de CT $3,400.00 · antes $3,000.00");
  });
});

describe("avisoDeSugerencia", () => {
  it("corto, y en alerta si el último precio ya no cubre el costo", () => {
    expect(avisoDeSugerencia(hoy({ costo: 4800, diferencia: -0.2 }), 6000, "MXN")).toEqual({ partes: ["Hoy en CT $4,800.00", "20 % menos que su costo"], alerta: false });
    expect(avisoDeSugerencia(hoy({}), 3300, "MXN")).toEqual({ partes: ["Hoy en CT $3,400.00", "13 % más que su costo"], alerta: true });
  });
});

describe("al guardar", () => {
  it("el aviso no viaja a la API", () => {
    const [enviada] = partidasParaApi([partidaNueva({ name: "Switch", unitCost: 3000, unitPrice: 3300, avisoCt: SWITCH })]);
    expect(enviada).not.toHaveProperty("avisoCt");
    expect(enviada).toMatchObject({ name: "Switch", unitCost: 3000, unitPrice: 3300 });
  });
});
