import { describe, expect, it } from "vitest";
import type { EntregasKpi, KpiPersonaFila, TotalesKpi } from "@/lib/kpis-equipo";
import {
  actividadesDelRango,
  atrasoEnPalabras,
  avisosDePersona,
  bloquesDelDia,
  detalleDeFila,
  entregasDelEquipo,
  entregasEnPalabras,
  escalaDeDias,
  estadoDeEntrega,
  fechaHoraMx,
  horasEnPalabras,
  minutoDelDia,
  ordenaRanking,
  porQueCuenta,
  resumenEnPalabras,
  revisionDeEntrega,
  tonoCumplimiento,
  tonoProductividad,
} from "@/lib/kpis-lectura";

const entregas = (over: Partial<EntregasKpi> = {}): EntregasKpi => ({
  medidas: 18,
  aTiempo: 17,
  tarde: 1,
  sinEntregar: 0,
  revisadas: 18,
  aprobadasALaPrimera: 18,
  devueltas: 0,
  pctATiempo: 94.4,
  pctALaPrimera: 100,
  ...over,
});

const base: TotalesKpi = {
  diasConJornada: 5,
  diasSinChecada: 0,
  faltasJustificadas: 0,
  retardos: 0,
  minutosTarde: 0,
  uniforme: { revisadas: 5, ok: 5, noOk: 0, sinRevisar: 0, pct: 100 },
  minutosLaborados: 2400,
  minutosProductivos: 1750,
  minutosInactivos: 650,
  productividadPct: 73,
  minutosExtra: 0,
  minutosExtraAprobados: 0,
  minutosExtraPendientes: 0,
  diasExtraPendientes: 0,
  jornadasAbiertas: 0,
  jornadasSinSalida: 0,
  cierresAutomaticos: 0,
  actividadesFueraDeJornada: 0,
};

describe("horas en palabras", () => {
  it("dice horas redondas sin minutos y minutos sueltos", () => {
    expect(horasEnPalabras(2400)).toBe("40 h");
    expect(horasEnPalabras(1750)).toBe("29 h 10 min");
    expect(horasEnPalabras(45)).toBe("45 min");
    expect(horasEnPalabras(null)).toBe("—");
  });
});

describe("resumen en palabras", () => {
  it("explica el tiempo en actividades, los retardos y el uniforme en frases", () => {
    const t = { ...base, retardos: 2, minutosTarde: 35, uniforme: { revisadas: 5, ok: 4, noOk: 1, sinRevisar: 0, pct: 80 } };
    expect(resumenEnPalabras(t)).toBe(
      "De 40 h en jornada, 29 h 10 min estuvo con el reloj de una actividad corriendo (73 %). Llegó tarde 2 veces (35 min en total). Uniforme correcto 4 de 5 días.",
    );
  });

  it("empieza por las entregas cuando la API las manda", () => {
    expect(resumenEnPalabras({ ...base, entregas: entregas() })).toMatch(
      /^Entregó 18 actividades: 17 a tiempo y 1 tarde; 18 de 18 aprobadas a la primera\. De 40 h en jornada, /,
    );
  });

  it("las entregas en una frase, solo con lo que aplica", () => {
    expect(entregasEnPalabras(entregas())).toBe("Entregó 18 actividades: 17 a tiempo y 1 tarde; 18 de 18 aprobadas a la primera.");
    expect(entregasEnPalabras(entregas({ aTiempo: 18, tarde: 0 }))).toBe(
      "Entregó 18 actividades, todas a tiempo; 18 de 18 aprobadas a la primera.",
    );
    expect(
      entregasEnPalabras(entregas({ medidas: 3, aTiempo: 1, tarde: 0, sinEntregar: 2, revisadas: 1, aprobadasALaPrimera: 0, devueltas: 1 })),
    ).toBe("Entregó 1 actividad, a tiempo; 2 vencieron sin entregar; 0 de 1 aprobada a la primera.");
    expect(entregasEnPalabras(entregas({ medidas: 2, aTiempo: 0, tarde: 2, revisadas: 0, aprobadasALaPrimera: 0 }))).toBe(
      "Entregó 2 actividades, todas tarde.",
    );
    expect(entregasEnPalabras(entregas({ medidas: 1, aTiempo: 0, tarde: 0, sinEntregar: 1, revisadas: 0, aprobadasALaPrimera: 0 }))).toBe(
      "1 actividad venció sin entregar.",
    );
    expect(entregasEnPalabras(entregas({ medidas: 0, aTiempo: 0, tarde: 0, revisadas: 0, aprobadasALaPrimera: 0 }))).toBe(
      "No tuvo actividades que entregar en estas fechas.",
    );
  });

  it("dice lo que no cuenta y los días sin checar", () => {
    const t = { ...base, diasSinChecada: 1, actividadesFueraDeJornada: 1, uniforme: { revisadas: 0, ok: 0, noOk: 0, sinRevisar: 3, pct: null } };
    const texto = resumenEnPalabras(t);
    expect(texto).toContain("Llegó a tiempo todos los días.");
    expect(texto).toContain("Nadie ha revisado su uniforme (3 entradas).");
    expect(texto).toContain("1 día laborable sin checar.");
    expect(texto).toContain("1 actividad la hizo sin checar entrada: no cuenta como productiva.");
  });

  it("sin horario no habla de retardos", () => {
    expect(resumenEnPalabras(base, { conHorario: false })).not.toContain("tarde");
  });
});

describe("avisos de la fila", () => {
  it("solo lo que pide atención", () => {
    expect(avisosDePersona(base)).toEqual([]);
    const avisos = avisosDePersona({ ...base, retardos: 2, minutosTarde: 35, diasSinChecada: 1, uniforme: { revisadas: 5, ok: 3, noOk: 2, sinRevisar: 0, pct: 60 } });
    expect(avisos.map((a) => a.texto)).toEqual(["2 retardos · 35 min", "Uniforme 3/5", "1 día sin checar"]);
  });

  it("las entregas van antes que los retardos", () => {
    const avisos = avisosDePersona({
      ...base,
      retardos: 1,
      minutosTarde: 20,
      entregas: entregas({ tarde: 2, sinEntregar: 1, devueltas: 1 }),
    });
    expect(avisos.map((a) => [a.texto, a.tono])).toEqual([
      ["2 tarde", "warning"],
      ["1 sin entregar", "danger"],
      ["1 devuelta", "warning"],
      ["1 retardo · 20 min", "warning"],
    ]);
    expect(avisosDePersona({ ...base, entregas: entregas({ tarde: 0, devueltas: 3 }) }).map((a) => a.texto)).toEqual(["3 devueltas"]);
  });
});

describe("cumplimiento", () => {
  it("tono con los cortes de entregas: 90 y 75", () => {
    expect([tonoCumplimiento(90), tonoCumplimiento(75), tonoCumplimiento(74.9), tonoCumplimiento(null), tonoCumplimiento(undefined)]).toEqual([
      "ok",
      "atencion",
      "critico",
      "sin_datos",
      "sin_datos",
    ]);
  });

  it("pista del equipo", () => {
    expect(entregasDelEquipo(entregas())).toBe("17 de 18 entregas a tiempo · 0 devueltas");
    expect(entregasDelEquipo(entregas({ medidas: 1, aTiempo: 1, tarde: 0, devueltas: 1 }))).toBe("1 de 1 entrega a tiempo · 1 devuelta");
    expect(entregasDelEquipo(entregas({ medidas: 0 }))).toBe("Sin entregas en estas fechas");
    expect(entregasDelEquipo(undefined)).toBe("Sin entregas en estas fechas");
  });

  it("el texto de la fila: entregas y horas; por tiempo o sin API nueva, solo horas", () => {
    const t = { ...base, minutosProductivos: 190, minutosLaborados: 1440, entregas: entregas() };
    expect(detalleDeFila(t)).toBe("17/18 a tiempo · 18/18 a la primera · 3 h 10 min en actividades de 24 h");
    expect(detalleDeFila(t, { tiempo: true })).toBe("3 h 10 min en actividades de 24 h");
    expect(detalleDeFila({ ...t, entregas: undefined })).toBe("3 h 10 min en actividades de 24 h");
    expect(detalleDeFila({ ...t, entregas: entregas({ medidas: 0, revisadas: 0 }) })).toBe("Sin entregas · 3 h 10 min en actividades de 24 h");
    expect(detalleDeFila({ ...t, minutosLaborados: 0, entregas: entregas({ revisadas: 0 }) })).toBe("17/18 a tiempo · Sin jornada");
  });
});

describe("entregas del detalle", () => {
  it("atraso en horas y, de un día para arriba, en días", () => {
    expect(atrasoEnPalabras(80)).toBe("1 h 20 min");
    expect(atrasoEnPalabras(1440)).toBe("1 día");
    expect(atrasoEnPalabras(2 * 1440 + 190)).toBe("2 días 3 h");
    expect(atrasoEnPalabras(null)).toBe("—");
  });

  it("estado con su atraso", () => {
    expect(estadoDeEntrega({ estado: "a_tiempo", minutosTarde: null })).toEqual({ texto: "A tiempo", tono: "success" });
    expect(estadoDeEntrega({ estado: "tarde", minutosTarde: 80 })).toEqual({ texto: "Tarde · 1 h 20 min", tono: "warning" });
    expect(estadoDeEntrega({ estado: "sin_entregar", minutosTarde: 120 })).toEqual({ texto: "Sin entregar · 2 h", tono: "danger" });
  });

  it("revisión del jefe", () => {
    expect(revisionDeEntrega({ estado: "a_tiempo", primeraRevision: "APROBADA", devoluciones: 0 }).texto).toBe("Aprobada a la primera");
    expect(revisionDeEntrega({ estado: "tarde", primeraRevision: "DEVUELTA", devoluciones: 2 })).toEqual({ texto: "Devuelta ×2", tono: "warning" });
    expect(revisionDeEntrega({ estado: "a_tiempo", primeraRevision: "DEVUELTA", devoluciones: 1 }).texto).toBe("Devuelta");
    expect(revisionDeEntrega({ estado: "a_tiempo", primeraRevision: null, devoluciones: 0 }).texto).toBe("Sin revisar");
    expect(revisionDeEntrega({ estado: "sin_entregar", primeraRevision: null, devoluciones: 0 }).texto).toBe("—");
  });

  it("día y hora en México, 24 h", () => {
    // 01:30 UTC del 6 = 19:30 del lunes 5 en México.
    expect(fechaHoraMx("2026-10-06T01:30:00.000Z")).toMatch(/^Lun 5 oct 19:30$/);
    expect(fechaHoraMx(null)).toBe("—");
  });
});

describe("ranking", () => {
  const fila = (id: number, nombre: string, pct: number | null, retardos = 0): KpiPersonaFila => ({
    persona: { id, nombre, email: "", avatarUrl: null, puesto: null },
    horario: { clave: null, etiqueta: "", entrada: null, salida: null, graciaMin: 15, jornadaOrdinariaMin: null, dias: [], personalizado: false },
    totales: { ...base, productividadPct: pct, retardos },
    semaforo: "verde",
    motivos: [],
  });
  const lista = [fila(1, "Beto", 54, 4), fila(2, "Ana", 88), fila(3, "Diego", null, 1), fila(4, "Carla", 79)];

  it("el mejor tiempo en actividades arriba y sin dato al final", () => {
    expect(ordenaRanking(lista, "productividad").map((f) => f.persona.nombre)).toEqual(["Ana", "Carla", "Beto", "Diego"]);
  });

  it("por cumplimiento: mayor arriba, a igualdad más entregas a tiempo, sin dato al final", () => {
    const con = (f: KpiPersonaFila, pct: number | null, aTiempo: number): KpiPersonaFila => ({
      ...f,
      totales: { ...f.totales, cumplimientoPct: pct, entregas: entregas({ aTiempo }) },
    });
    // David: mucho reloj corriendo (98 %) pero poco cumplimiento; Luis y Daniela empatan y gana quien entregó más a tiempo.
    const equipo = [
      con(fila(5, "David", 98, 4), 61, 1),
      con(fila(7, "Luis", 60), 95, 17),
      con(fila(38, "Daniela", 58), 95, 13),
      con(fila(9, "Sin entregas", 90), null, 0),
    ];
    expect(ordenaRanking(equipo, "cumplimiento").map((f) => f.persona.nombre)).toEqual(["Luis", "Daniela", "David", "Sin entregas"]);
    // Una API vieja (sin cumplimiento) no truena: queda por nombre.
    expect(ordenaRanking(lista, "cumplimiento").map((f) => f.persona.nombre)).toEqual(["Ana", "Beto", "Carla", "Diego"]);
  });

  it("por nombre y por retardos", () => {
    expect(ordenaRanking(lista, "nombre").map((f) => f.persona.nombre)).toEqual(["Ana", "Beto", "Carla", "Diego"]);
    expect(ordenaRanking(lista, "retardos")[0].persona.nombre).toBe("Beto");
  });

  it("tono con los cortes del semáforo", () => {
    expect([tonoProductividad(70), tonoProductividad(50), tonoProductividad(49), tonoProductividad(null)]).toEqual([
      "ok",
      "atencion",
      "critico",
      "sin_datos",
    ]);
  });
});

describe("línea de tiempo con escala común", () => {
  const dia = {
    fecha: "2026-09-16",
    tramos: {
      jornada: [{ inicio: "2026-09-16T15:05:00.000Z", fin: "2026-09-16T23:00:00.000Z" }],
      comida: [{ inicio: "2026-09-16T20:40:00.000Z", fin: "2026-09-16T21:55:00.000Z" }],
      productivo: [{ inicio: "2026-09-16T17:00:00.000Z", fin: "2026-09-16T18:00:00.000Z" }],
      inactivo: [],
    },
    actividades: [
      { activityId: 513, anNumber: "AN-513", titulo: "Reubicación de cámara", inicio: "2026-09-16T17:00:00.000Z", fin: "2026-09-16T18:00:00.000Z", enCurso: false, minutosEnJornada: 60 },
    ],
  };

  it("mide en hora de México y cruza la medianoche", () => {
    expect(minutoDelDia("2026-09-16T15:05:00.000Z", "2026-09-16")).toBe(9 * 60 + 5);
    expect(minutoDelDia("2026-09-17T06:30:00.000Z", "2026-09-16")).toBe(24 * 60 + 30);
  });

  it("la escala va de la hora en punto antes de entrar a la siguiente después de salir", () => {
    const escala = escalaDeDias([dia])!;
    expect(escala.desde).toBe(9 * 60);
    expect(escala.hasta).toBe(17 * 60);
    expect(escala.horas).toHaveLength(9);
  });

  it("el bloque productivo dice qué actividad lo cubre", () => {
    const escala = escalaDeDias([dia])!;
    const productivo = bloquesDelDia(dia, escala).find((b) => b.tipo === "productivo")!;
    expect(productivo.izquierdaPct).toBeCloseTo(25);
    expect(productivo.anchoPct).toBeCloseTo(12.5);
    expect(productivo.actividades).toEqual([{ anNumber: "AN-513", titulo: "Reubicación de cámara" }]);
  });

  it("las actividades del rango con su duración real y solo la nota de lo que no cuenta", () => {
    const [a] = actividadesDelRango([{ ...dia, actividades: [{ ...dia.actividades[0], minutosEnJornada: 40 }] }]);
    expect(a.minutosReales).toBe(60);
    expect(porQueCuenta(a)).toBe("20 min fuera de jornada");
    // Lo que cuenta completo no lleva nota: la tabla no repite lo obvio.
    expect(porQueCuenta({ minutosReales: 60, minutosEnJornada: 60, enCurso: false })).toBe("");
    expect(porQueCuenta({ minutosReales: 60, minutosEnJornada: 0, enCurso: false })).toBe("No cuenta: fuera de jornada");
  });
});
