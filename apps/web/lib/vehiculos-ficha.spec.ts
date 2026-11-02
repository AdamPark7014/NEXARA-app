import { describe, expect, it } from "vitest";
import {
  aNumero,
  etiquetaFuente,
  fechaCorta,
  fechaLarga,
  km,
  kmPorLitro,
  mesActual,
  mesesRecientes,
  nombreDeVehiculo,
  nombreMes,
  pctDeDesglose,
  rendimientoDeEstaCarga,
  repartoDelMes,
  tarifaEstimada,
  textoIntervalo,
  textoServicio,
} from "./vehiculos-ficha";
import { datosDelNombre } from "./vehiculos-ficha";

describe("datos del nombre del vehículo", () => {
  it("separa marca, modelo y año", () => {
    expect(datosDelNombre("Nissan Frontier 2026")).toEqual({ marca: "Nissan", modelo: "Frontier", anio: "2026" });
    expect(datosDelNombre("  mercedes-benz   Sprinter ")).toEqual({ marca: "Mercedes-Benz", modelo: "Sprinter" });
    expect(datosDelNombre("Toyota")).toEqual({ marca: "Toyota" });
  });

  it("no toma por año un número que es parte del modelo", () => {
    expect(datosDelNombre("Nissan NP300")).toEqual({ marca: "Nissan", modelo: "NP300" });
    expect(datosDelNombre("Ford F-150 1500")).toEqual({ marca: "Ford", modelo: "F-150 1500" });
  });

  it("si no empieza con una marca conocida, no adivina", () => {
    expect(datosDelNombre("Ranger 2021")).toEqual({});
    expect(datosDelNombre("Camioneta blanca")).toEqual({});
    expect(datosDelNombre("Fordham 2020")).toEqual({});
    expect(datosDelNombre(null)).toEqual({});
  });
});

describe("formatos", () => {
  it("km y rendimiento, con raya cuando no hay dato", () => {
    expect(km(12480)).toBe("12,480 km");
    expect(km(null)).toBe("—");
    expect(kmPorLitro(8.6)).toBe("8.6 km/L");
    expect(kmPorLitro(undefined)).toBe("—");
  });

  it("una fecha sin hora no se corre un día", () => {
    expect(fechaCorta("2026-10-01")).toBe("1 oct");
    expect(fechaCorta("2026-10-28T23:00:00.000Z")).toBe("28 oct");
    expect(fechaLarga("2027-03-05")).toBe("5 de marzo de 2027");
    expect(fechaCorta(null)).toBe("—");
  });

  it("el mes en curso es el de México, no el de UTC", () => {
    expect(mesActual(new Date("2026-11-01T03:00:00Z"))).toBe("2026-10");
    expect(mesActual(new Date("2026-11-01T07:00:00Z"))).toBe("2026-11");
  });

  it("los meses recientes cruzan de año", () => {
    const m = mesesRecientes(3, new Date("2026-02-15T18:00:00Z"));
    expect(m.map((x) => x.id)).toEqual(["2026-02", "2026-01", "2025-12"]);
    expect(m[2].texto).toBe("Diciembre 2025");
    expect(nombreMes("2026-10")).toBe("Octubre 2026");
  });
});

describe("de dónde salió cada dato", () => {
  it("manual con página, CONUEE, tickets y captura", () => {
    expect(etiquetaFuente({ tipo: "MANUAL", pagina: 418 })).toEqual({ texto: "Manual p. 418", tono: "manual" });
    expect(etiquetaFuente({ tipo: "CONUEE", pagina: 21 })).toEqual({ texto: "CONUEE 2023 p. 21", tono: "conuee" });
    expect(etiquetaFuente({ tipo: "CONUEE", pagina: null }).texto).toBe("CONUEE 2023");
    expect(etiquetaFuente({ tipo: "TICKETS" }).texto).toBe("Tus tickets");
    expect(etiquetaFuente({ tipo: "CAPTURA" }).texto).toBe("Capturado");
    expect(etiquetaFuente(undefined).texto).toBe("Capturado");
  });
});

describe("próximo servicio", () => {
  const base = { km: 20020, fecha: "2027-03-05", conceptos: ["Aceite"], estado: "OK" as const };

  it("dice cuánto falta o por cuánto se pasó", () => {
    expect(textoServicio({ ...base, faltanKm: 7540 })).toBe("En 7,540 km");
    expect(textoServicio({ ...base, faltanKm: -320, estado: "VENCIDO" })).toBe("Vencido por 320 km");
  });

  it("si solo va por tiempo, da la fecha", () => {
    expect(textoServicio({ ...base, km: null, faltanKm: null })).toBe("El 5 mar");
    expect(textoServicio({ ...base, km: null, faltanKm: null, estado: "VENCIDO" })).toBe("Venció 5 mar");
  });

  it("sin programa lo dice", () => {
    expect(textoServicio(null)).toBe("Sin programa");
  });

  it("intervalo por km, por tiempo o por lo que llegue primero", () => {
    expect(textoIntervalo({ cadaKm: 10000, cadaMeses: 6 })).toBe("Cada 10,000 km o 6 meses");
    expect(textoIntervalo({ cadaKm: 10000, cadaMeses: null })).toBe("Cada 10,000 km");
    expect(textoIntervalo({ cadaKm: null, cadaMeses: 1 })).toBe("Cada 1 mes");
    expect(textoIntervalo({ cadaKm: null, cadaMeses: null })).toBe("—");
  });
});

describe("reparto del mes", () => {
  it("los porcentajes del mockup: 51.4, 12.9, 8.1, 9.6 y 18", () => {
    const { total, renglones } = repartoDelMes({
      proyectos: { km: 1510, importe: 11310 },
      cotizaciones: { km: 380, importe: 2840 },
      oficina: { km: 240, importe: 1790 },
      sinLigar: { km: 280, importe: 2104 },
      parado: 3960,
    });
    expect(total).toBe(22004);
    expect(renglones.map((r) => r.pct)).toEqual([51.4, 12.9, 8.1, 9.6, 18]);
    expect(renglones[4].km).toBeNull();
  });

  it("sin costos no divide entre cero", () => {
    const { total, renglones } = repartoDelMes({
      proyectos: { km: 100, importe: null },
      cotizaciones: { km: 0, importe: null },
      oficina: { km: 0, importe: null },
      sinLigar: { km: 0, importe: null },
      parado: null,
    });
    expect(total).toBe(0);
    expect(renglones.every((r) => r.pct === 0)).toBe(true);
  });

  it("los porcentajes del km: 38, 22, 16, 13, 6, 3 y 2", () => {
    const partes = [2.85, 1.62, 1.22, 0.97, 0.41, 0.24, 0.12].map((importe) => ({ importe }));
    expect(pctDeDesglose(partes)).toEqual([38, 22, 16, 13, 6, 3, 2]);
    expect(pctDeDesglose([{ importe: 0 }])).toEqual([0]);
  });
});

describe("vista previa del costo", () => {
  const ficha = {
    valor: 480000,
    valorLlantas: 12000,
    rescatePct: 0.3,
    vidaKm: 200000,
    kmAnio: 30000,
    tasaInteres: 0.12,
    primaSeguro: 0.04,
    ko: 0.6,
    precioCombustible: 24.5,
    rendimiento: 11.91,
    costoAceite: 1200,
    aceiteCadaKm: 10000,
    vidaLlantasKm: 50000,
    otrosAnuales: 0,
  };

  it("da lo mismo que el mockup: $6.64 con oficial, $7.43 con real", () => {
    expect(tarifaEstimada(ficha)).toBe(6.64);
    expect(tarifaEstimada({ ...ficha, rendimiento: 8.6 })).toBe(7.43);
  });

  it("sin precio no hay costo", () => {
    expect(tarifaEstimada({ ...ficha, valor: 0 })).toBeNull();
  });

  it("sin rendimiento cuenta lo demás, sin gasolina", () => {
    expect(tarifaEstimada({ ...ficha, rendimiento: null })).toBe(4.58);
  });
});

describe("rendimiento de una carga", () => {
  const cargas = [
    { odometro: 12030, litros: 50, tanqueLleno: true },
    { odometro: 11000, litros: 50, tanqueLleno: true },
  ];

  it("450 km desde el último lleno entre 52.3 L son 8.6 km/L", () => {
    expect(rendimientoDeEstaCarga(cargas, 12480, 52.3)).toEqual({ km: 450, litros: 52.3, kmPorLitro: 8.6 });
  });

  it("suma lo cargado a medias desde el último lleno", () => {
    const conParcial = [{ odometro: 12200, litros: 20, tanqueLleno: false }, ...cargas];
    expect(rendimientoDeEstaCarga(conParcial, 12480, 32.3)).toEqual({ km: 450, litros: 52.3, kmPorLitro: 8.6 });
  });

  it("sin lleno anterior, o con un número imposible, no mide", () => {
    expect(rendimientoDeEstaCarga([], 12480, 50)).toBeNull();
    expect(rendimientoDeEstaCarga(cargas, 90000, 50)).toBeNull();
  });
});

describe("captura", () => {
  it("un campo vacío o con letras es null, no cero", () => {
    expect(aNumero("")).toBeNull();
    expect(aNumero("   ")).toBeNull();
    expect(aNumero("abc")).toBeNull();
    expect(aNumero(null)).toBeNull();
    expect(aNumero("$480,000")).toBe(480000);
    expect(aNumero("0")).toBe(0);
    expect(aNumero(52.3)).toBe(52.3);
  });

  it("el nombre sale de marca, modelo y año", () => {
    expect(nombreDeVehiculo({ marca: "Nissan", modelo: "Frontier", anio: 2026 })).toBe("Nissan Frontier 2026");
    expect(nombreDeVehiculo({ modelo: "Frontier" })).toBe("Frontier");
    expect(nombreDeVehiculo({})).toBe("");
  });
});
