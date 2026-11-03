import { describe, expect, it } from "vitest";
import { cuadrosDeModulos, horasCortas, montoCorto, porcentaje } from "./direccion-api";

describe("cifras de dirección", () => {
  it("escribe porcentajes, horas y montos sin inventar", () => {
    expect(porcentaje(91)).toBe("91 %");
    expect(porcentaje(0)).toBe("0 %");
    expect(porcentaje(null)).toBe("—");
    expect(horasCortas(473)).toBe("7 h 53");
    expect(horasCortas(420)).toBe("7 h");
    expect(horasCortas(45)).toBe("45 min");
    expect(horasCortas(null)).toBe("—");
    expect(montoCorto(9_078_633)).toBe("$9.08 M");
    expect(montoCorto(480_000)).toBe("$480 mil");
    expect(montoCorto(null)).toBe("—");
  });

  it("un módulo sin registros dice que no tiene captura; sin dato, una raya", () => {
    const c = cuadrosDeModulos({
      porValidar: 38,
      cotizaciones: { borrador: 57, enviadas: 0, monto: 9_078_633 },
      proyectos: 1,
      clientes: 32,
      disenos: 9,
      costos: 351,
      productos: 0,
      herramientas: 2,
      facturas: null,
    });
    const de = (id: string) => c.find((x) => x.id === id)!;
    expect(de("almacen")).toMatchObject({ sinCaptura: true, nota: "0 productos" });
    expect(de("facturas")).toMatchObject({ valor: "—" });
    expect(de("facturas").sinCaptura).toBeUndefined();
    expect(de("cotizaciones")).toMatchObject({ valor: "$9.08 M", nota: "57 en borrador, 0 enviadas" });
    expect(de("actividades").href).toBe("/erp/pizarra?vista=revision");
  });
});
