import { describe, expect, it } from "vitest";
import {
  fechaCorta,
  formatHoras,
  formatPctKpi,
  horaMx,
  lineaDeTiempo,
  ordenaPersonas,
  rangoDesdeUrl,
  uniformeTexto,
  type KpiPersonaFila,
  type SemaforoKpi,
  type TotalesKpi,
} from "./kpis-equipo";

const M = (dia: string, hhmm: string) => new Date(`2026-09-${dia}T${hhmm}:00-06:00`).toISOString();

const totales = (over: Partial<TotalesKpi> = {}): TotalesKpi => ({
  diasConJornada: 5,
  diasSinChecada: 0,
  faltasJustificadas: 0,
  retardos: 0,
  minutosTarde: 0,
  uniforme: { revisadas: 0, ok: 0, noOk: 0, sinRevisar: 0, pct: null },
  minutosLaborados: 2400,
  minutosProductivos: 1800,
  minutosInactivos: 600,
  productividadPct: 75,
  minutosExtra: 0,
  jornadasAbiertas: 0,
  jornadasSinSalida: 0,
  cierresAutomaticos: 0,
  actividadesFueraDeJornada: 0,
  ...over,
});

const persona = (id: number, nombre: string, semaforo: SemaforoKpi, over: Partial<TotalesKpi> = {}): KpiPersonaFila => ({
  persona: { id, nombre, email: `${id}@x.mx`, avatarUrl: null, puesto: null },
  horario: { clave: "office_hours", etiqueta: "Oficina", entrada: "09:00", graciaMin: 15, jornadaOrdinariaMin: 480 },
  totales: totales(over),
  semaforo,
  motivos: [],
});

describe("formato", () => {
  it("horas compactas para la tabla", () => {
    expect(formatHoras(425)).toBe("7 h 05");
    expect(formatHoras(45)).toBe("45 min");
    expect(formatHoras(0)).toBe("0 min");
    expect(formatHoras(null)).toBe("—");
    expect(formatPctKpi(44.4)).toBe("44 %");
    expect(formatPctKpi(null)).toBe("—");
  });

  it("uniforme en palabras", () => {
    expect(uniformeTexto({ revisadas: 3, ok: 2, noOk: 1, sinRevisar: 1, pct: 67 })).toBe(
      "2 de 3 con uniforme · 1 sin revisar",
    );
    expect(uniformeTexto({ revisadas: 2, ok: 2, noOk: 0, sinRevisar: 0, pct: 100 })).toBe("2 de 2 con uniforme");
    expect(uniformeTexto({ revisadas: 0, ok: 0, noOk: 0, sinRevisar: 4, pct: null })).toBe("4 sin revisar");
  });

  it("hora y fecha en México, sin correrse de día", () => {
    expect(horaMx(M("14", "09:05"))).toBe("09:05");
    expect(horaMx(null)).toBe("—");
    // «Lun 14 sep» (el ICU puede escribir «sept»): mayúscula solo al inicio.
    expect(fechaCorta("2026-09-14")).toMatch(/^Lun 14 sept?$/);
  });
});

describe("ordenaPersonas", () => {
  const lista = [
    persona(1, "Carla", "verde", { productividadPct: 80 }),
    persona(2, "Ana", "rojo", { productividadPct: 30, retardos: 4, minutosInactivos: 900 }),
    persona(3, "Beto", "amarillo", { productividadPct: 60, retardos: 1 }),
    persona(4, "Dora", "sin_datos", { productividadPct: null, minutosInactivos: 0 }),
    persona(5, "Eli", "rojo", { productividadPct: 45, uniforme: { revisadas: 4, ok: 2, noOk: 2, sinRevisar: 0, pct: 50 } }),
  ];
  const ids = (orden: Parameters<typeof ordenaPersonas>[1]) => ordenaPersonas(lista, orden).map((p) => p.persona.id);

  it("semáforo: lo urgente primero y, dentro, la menor productividad", () => {
    expect(ids("semaforo")).toEqual([2, 5, 3, 1, 4]);
  });

  it("los demás criterios, con los que no tienen dato al final", () => {
    expect(ids("productividad")).toEqual([2, 5, 3, 1, 4]);
    expect(ids("retardos")[0]).toBe(2);
    expect(ids("inactividad")[0]).toBe(2);
    expect(ids("uniforme")[0]).toBe(5);
    expect(ids("nombre")).toEqual([2, 3, 1, 4, 5]);
  });

  it("no cambia el arreglo original", () => {
    ordenaPersonas(lista, "nombre");
    expect(lista.map((p) => p.persona.id)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("rangoDesdeUrl", () => {
  const hoy = "2026-09-18"; // viernes
  it("sin rango en la URL: la semana (lunes a hoy)", () => {
    expect(rangoDesdeUrl("", hoy)).toEqual({ preset: "semana", rango: { desde: "2026-09-14", hasta: hoy } });
    expect(rangoDesdeUrl("?desde=basura&hasta=2026-09-18", hoy).preset).toBe("semana");
  });

  it("reconoce Hoy / Semana / Mes y si no, personalizado", () => {
    expect(rangoDesdeUrl("?desde=2026-09-18&hasta=2026-09-18", hoy).preset).toBe("hoy");
    expect(rangoDesdeUrl("?desde=2026-09-01&hasta=2026-09-18", hoy).preset).toBe("mes");
    expect(rangoDesdeUrl("?desde=2026-08-01&hasta=2026-08-31", hoy)).toEqual({
      preset: "personalizado",
      rango: { desde: "2026-08-01", hasta: "2026-08-31" },
    });
  });
});

describe("lineaDeTiempo", () => {
  const dia = {
    tramos: {
      jornada: [{ inicio: M("14", "09:10"), fin: M("14", "18:00") }],
      comida: [{ inicio: M("14", "15:00"), fin: M("14", "16:00") }],
      productivo: [{ inicio: M("14", "10:00"), fin: M("14", "12:00") }],
      inactivo: [
        { inicio: M("14", "09:10"), fin: M("14", "10:00") },
        { inicio: M("14", "12:00"), fin: M("14", "15:00") },
        { inicio: M("14", "16:00"), fin: M("14", "18:00") },
      ],
    },
  };

  it("escala de la hora en punto anterior a la siguiente y segmentos en %", () => {
    const l = lineaDeTiempo(dia)!;
    expect(new Date(l.inicio).toISOString()).toBe(M("14", "09:00"));
    expect(new Date(l.fin).toISOString()).toBe(M("14", "18:00"));
    const prod = l.segmentos.find((s) => s.tipo === "productivo")!;
    expect(prod.izquierdaPct).toBeCloseTo((60 / 540) * 100);
    expect(prod.anchoPct).toBeCloseTo((120 / 540) * 100);
    // Los segmentos cubren de la entrada a la salida sin huecos ni encimarse.
    const cubierto = l.segmentos.reduce((s, x) => s + x.anchoPct, 0);
    expect(cubierto).toBeCloseTo((530 / 540) * 100);
    expect(l.marcas).toHaveLength(10);
    expect(l.marcas[0].pct).toBe(0);
    expect(l.marcas[9].pct).toBe(100);
  });

  it("sin jornada no hay línea", () => {
    expect(lineaDeTiempo({ tramos: { jornada: [], comida: [], productivo: [], inactivo: [] } })).toBeNull();
    expect(lineaDeTiempo({})).toBeNull();
  });

  it("jornadas largas: una marca cada dos horas", () => {
    const larga = lineaDeTiempo({
      tramos: {
        jornada: [{ inicio: M("14", "06:00"), fin: M("14", "22:00") }],
        comida: [],
        productivo: [],
        inactivo: [{ inicio: M("14", "06:00"), fin: M("14", "22:00") }],
      },
    })!;
    expect(larga.marcas).toHaveLength(9);
  });
});
