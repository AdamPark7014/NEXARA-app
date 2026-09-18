import { describe, expect, it } from "vitest";
import {
  accionesDeEstado,
  aInputFecha,
  barraEnRango,
  diaDe,
  diasEntre,
  hitoVencido,
  hoyISO,
  isoDeDia,
  marcasDeMes,
  porcentajeEnRango,
  puedeTransicionar,
  rangoDe,
  repartirFechas,
  textoPlazo,
  tramosDeEtapas,
} from "./proyecto-plan";

describe("días de calendario", () => {
  it("lee la fecha en UTC: medianoche UTC no se corre al día anterior", () => {
    expect(isoDeDia(diaDe("2026-09-20T00:00:00.000Z")!)).toBe("2026-09-20");
    expect(isoDeDia(diaDe("2026-09-20")!)).toBe("2026-09-20");
    expect(aInputFecha("2026-01-05T00:00:00.000Z")).toBe("2026-01-05");
    expect(aInputFecha(null)).toBe("");
    expect(diaDe("no es fecha")).toBeNull();
  });

  it("hoy es el día local de quien mira, no el de UTC", () => {
    // 23:30 del 17 en México ya es 18 en UTC; la persona sigue en el 17.
    const nochePuebla = new Date(2026, 8, 17, 23, 30);
    expect(hoyISO(nochePuebla)).toBe("2026-09-17");
  });

  it("cuenta días con signo", () => {
    expect(diasEntre("2026-09-17", "2026-09-20")).toBe(3);
    expect(diasEntre("2026-09-20", "2026-09-17")).toBe(-3);
    expect(diasEntre(null, "2026-09-17")).toBeNull();
  });
});

describe("rango y posiciones del cronograma", () => {
  it("va de la fecha más temprana a la más tardía con un margen pequeño", () => {
    const r = rangoDe(["2026-09-01", null, "2026-12-31", "2026-10-15"])!;
    expect(r.desde).toBeLessThan(diaDe("2026-09-01")!);
    expect(r.hasta).toBeGreaterThan(diaDe("2026-12-31")!);
    expect(r.hasta - r.desde).toBeLessThan(130);
  });

  it("sin fechas no hay rango, y con una sola se abre una ventana", () => {
    expect(rangoDe([null, undefined, ""])).toBeNull();
    const r = rangoDe(["2026-09-17"])!;
    expect(r.hasta - r.desde).toBe(14);
  });

  it("la posición se queda entre 0 y 100", () => {
    const r = { desde: 100, hasta: 200 };
    expect(porcentajeEnRango(150, r)).toBe(50);
    expect(porcentajeEnRango(50, r)).toBe(0);
    expect(porcentajeEnRango(250, r)).toBe(100);
  });

  it("una barra de un solo día sigue viéndose y no se sale por la derecha", () => {
    const r = { desde: 0, hasta: 100 };
    expect(barraEnRango(10, 60, r)).toEqual({ left: 10, width: 50 });
    const punto = barraEnRango(100, 100, r);
    expect(punto.width).toBeGreaterThan(0);
    expect(punto.left + punto.width).toBeLessThanOrEqual(100);
  });
});

describe("tramos de las etapas", () => {
  it("cada etapa va del fin de la anterior (o del inicio del proyecto) a su fecha", () => {
    const tramos = tramosDeEtapas(
      [
        { id: 1, plannedDate: "2026-09-10" },
        { id: 2, plannedDate: null },
        { id: 3, plannedDate: "2026-10-01" },
      ],
      "2026-09-01",
    );
    expect(tramos[0]).toEqual({ id: 1, desde: diaDe("2026-09-01"), hasta: diaDe("2026-09-10") });
    expect(tramos[1]).toEqual({ id: 2, desde: null, hasta: null });
    expect(tramos[2]).toEqual({ id: 3, desde: diaDe("2026-09-10"), hasta: diaDe("2026-10-01") });
  });

  it("una etapa fuera de orden se dibuja como punto en su fecha", () => {
    const tramos = tramosDeEtapas(
      [
        { id: 1, plannedDate: "2026-10-01" },
        { id: 2, plannedDate: "2026-09-15" },
      ],
      "2026-09-01",
    );
    expect(tramos[1].desde).toBe(tramos[1].hasta);
  });
});

describe("marcas de mes", () => {
  it("pone el primer día de cada mes dentro del rango, con el año en la primera", () => {
    const r = { desde: diaDe("2026-08-20")!, hasta: diaDe("2026-11-10")! };
    const marcas = marcasDeMes(r);
    expect(marcas.map((m) => m.etiqueta)).toEqual(["sep 2026", "oct", "nov"]);
    expect(marcas.every((m) => m.porcentaje > 0 && m.porcentaje < 100)).toBe(true);
  });

  it("en rangos largos salta meses para no amontonar", () => {
    const r = { desde: diaDe("2026-01-15")!, hasta: diaDe("2028-01-15")! };
    expect(marcasDeMes(r, 6).length).toBeLessThanOrEqual(6);
  });

  it("marca el cambio de año", () => {
    const r = { desde: diaDe("2026-11-20")!, hasta: diaDe("2027-02-10")! };
    expect(marcasDeMes(r).map((m) => m.etiqueta)).toEqual(["dic 2026", "ene 2027", "feb"]);
  });
});

describe("fechas sugeridas y plazos", () => {
  it("reparte las etapas hasta el fin planeado", () => {
    expect(repartirFechas("2026-09-01", "2026-09-11", 2)).toEqual(["2026-09-06", "2026-09-11"]);
  });

  it("sin fin planeado, una por semana", () => {
    expect(repartirFechas("2026-09-01", "", 2)).toEqual(["2026-09-08", "2026-09-15"]);
  });

  it("una etapa vencida es la que pasó su fecha sin cumplirse", () => {
    expect(hitoVencido({ plannedDate: "2026-09-10", status: "PENDIENTE" }, "2026-09-17")).toBe(true);
    expect(hitoVencido({ plannedDate: "2026-09-10", status: "CUMPLIDO" }, "2026-09-17")).toBe(false);
    expect(hitoVencido({ plannedDate: "2026-09-10", actualDate: "2026-09-12" }, "2026-09-17")).toBe(false);
    expect(hitoVencido({ plannedDate: "2026-09-17", status: "PENDIENTE" }, "2026-09-17")).toBe(false);
  });

  it("dice el plazo en palabras", () => {
    expect(textoPlazo("2026-09-17", "2026-09-17")).toBe("Vence hoy");
    expect(textoPlazo("2026-09-18", "2026-09-17")).toBe("Falta 1 día");
    expect(textoPlazo("2026-09-20", "2026-09-17")).toBe("Faltan 3 días");
    expect(textoPlazo("2026-09-14", "2026-09-17")).toBe("Venció hace 3 días");
    expect(textoPlazo(null, "2026-09-17")).toBe("Sin fecha");
  });
});

describe("cambios de estado", () => {
  it("copia las transiciones de la API", () => {
    expect(puedeTransicionar("PLANNED", "COMPLETED")).toBe(false);
    expect(puedeTransicionar("COMPLETED", "ON_HOLD")).toBe(false);
    expect(puedeTransicionar("CANCELLED", "PLANNED")).toBe(true);
  });

  it("ofrece las acciones con palabras de la operación", () => {
    expect(accionesDeEstado("PLANNED").map((a) => a.etiqueta)).toEqual([
      "Arrancar proyecto",
      "Poner en pausa",
      "Cancelar proyecto",
    ]);
    expect(accionesDeEstado("COMPLETED")).toEqual([{ hacia: "ACTIVE", etiqueta: "Reabrir" }]);
  });

  it("cancelar pide motivo y terminar pide la fecha de entrega", () => {
    const acciones = accionesDeEstado("ACTIVE");
    expect(acciones.find((a) => a.hacia === "CANCELLED")).toMatchObject({ pide: "motivo", peligro: true });
    expect(acciones.find((a) => a.hacia === "COMPLETED")).toMatchObject({ pide: "fechaDeEntrega" });
  });
});
