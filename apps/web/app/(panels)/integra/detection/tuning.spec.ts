import { describe, expect, it } from "vitest";
import {
  FALLBACK_LIMITS,
  MAX_POINTS,
  MAX_REGIONS,
  MIN_POINTS,
  draftFromProfile,
  isRouteMissing,
  parseProfile,
  patchFromDraft,
  readRegions,
  readWindow,
  sensitivityMeaning,
  tuningProblems,
  type DetectionRegion,
  type TuningDraft,
} from "./_tuningApi";
import {
  addPointAfter,
  areaFraction,
  canAddRegion,
  centroid,
  movePoint,
  newRegion,
  polygonPoints,
  removePoint,
  toNormalized,
} from "./_regionGeometry";
import { countLabel, summarize, typeLabel } from "./_noise";

/**
 * La pantalla de sintonización habla con un endpoint que puede no estar
 * publicado todavía. Lo que se prueba aquí es lo que hace que eso no sea
 * peligroso: leer lo que venga sin romperse, distinguir «no hay ruta» de «la
 * ruta contestó 404», y no dejar guardar un polígono imposible.
 *
 * Los nombres son los del contrato del servidor (`alarmConfidence`,
 * `detectionTarget`, `regions` como array plano de vértices): si alguien los
 * cambia en el front, estas pruebas caen antes que la integración.
 */

const CUADRADO: DetectionRegion = [
  { x: 0.2, y: 0.2 },
  { x: 0.6, y: 0.2 },
  { x: 0.6, y: 0.6 },
  { x: 0.2, y: 0.6 },
];

/** Respuesta típica de `GET integra/cameras/:id/detection`. */
function perfil(over: Record<string, unknown> = {}) {
  return {
    cameraId: "cam-171",
    cameraName: "Recepción",
    deviceIp: "10.0.0.171",
    channel: 1,
    enabled: true,
    stored: null,
    effective: {
      sensitivity: 50,
      alarmConfidence: "mediumHigh",
      detectionTarget: "human",
      regions: null,
      timeThresholdSec: 0,
      eventTypes: ["fielddetection"],
    },
    lastAppliedAt: null,
    lastAppliedNote: null,
    capabilities: null,
    limits: {
      sensitivityMin: 0,
      sensitivityMax: 100,
      sensitivityDefault: 50,
      maxRegions: 4,
      alarmConfidences: ["low", "mediumLow", "mediumHigh", "high"],
      detectionTargets: ["human", "vehicle", "human,vehicle"],
    },
    ...over,
  };
}

describe("parseProfile · leer al servidor sin fiarse", () => {
  it("una respuesta que no es objeto no revienta: quedan los valores de reserva", () => {
    const p = parseProfile(null, "cam-1");
    expect(p.cameraId).toBe("cam-1");
    expect(p.effective.sensitivity).toBe(FALLBACK_LIMITS.sensitivityDefault);
    expect(p.effective.regions).toBeNull();
    expect(p.limits).toEqual(FALLBACK_LIMITS);
  });

  it("lee `effective`, que es lo que el servidor le escribiría hoy al equipo", () => {
    const p = parseProfile(
      perfil({
        effective: {
          sensitivity: 35,
          alarmConfidence: "high",
          detectionTarget: "human,vehicle",
          regions: [CUADRADO],
          timeThresholdSec: 3,
          eventTypes: ["fielddetection", "linedetection"],
        },
      }),
      "cam-171",
    );
    expect(p.effective.sensitivity).toBe(35);
    expect(p.effective.alarmConfidence).toBe("high");
    expect(p.effective.detectionTarget).toBe("human,vehicle");
    expect(p.effective.regions).toEqual([CUADRADO]);
  });

  it("distingue una cámara nunca editada de una con perfil propio", () => {
    expect(parseProfile(perfil(), "c").hasStoredProfile).toBe(false);
    expect(parseProfile(perfil({ stored: { schedule: null } }), "c").hasStoredProfile).toBe(true);
  });

  it("`regions: null` significa fotograma completo, y así llega al borrador", () => {
    // Es el comportamiento que hay hoy en producción y la causa del ruido: en
    // pantalla se traduce a «sin regiones», no a un polígono inventado.
    const d = draftFromProfile(parseProfile(perfil(), "c"));
    expect(d.regions).toEqual([]);
  });

  it("una confianza que no es de las cuatro no se pinta como si lo fuera", () => {
    const p = parseProfile(
      perfil({ effective: { ...perfil().effective, alarmConfidence: "altísima" } }),
      "c",
    );
    expect(p.limits.alarmConfidences).toContain(p.effective.alarmConfidence);
  });

  it("los límites del servidor mandan sobre los de reserva", () => {
    const p = parseProfile(
      perfil({ limits: { ...perfil().limits, maxRegions: 2, sensitivityDefault: 70 } }),
      "c",
    );
    expect(p.limits.maxRegions).toBe(2);
    expect(p.limits.sensitivityDefault).toBe(70);
  });

  it("la ventana horaria se recupera del `schedule` que guardó esta pantalla", () => {
    const p = parseProfile(
      perfil({ stored: { schedule: { start: "07:30", end: "19:00", days: [1, 2, 3, 4, 5] } } }),
      "c",
    );
    expect(p.window).toEqual({ start: "07:30", end: "19:00", days: [1, 2, 3, 4, 5] });
  });

  it("un `schedule` de otro formato no se malinterpreta: se ignora", () => {
    // El campo es JSON libre en el servidor. Si otro cliente escribe algo que
    // esta pantalla no sabe leer, se vuelve a la ventana por defecto en vez de
    // enseñar horas inventadas.
    expect(parseProfile(perfil({ stored: { schedule: { cron: "0 8 * * 1-5" } } }), "c").window)
      .toBeNull();
  });
});

describe("readRegions · el saneado que hace el servidor, también aquí", () => {
  it("descarta polígonos de menos de tres vértices", () => {
    expect(readRegions([[{ x: 0.1, y: 0.1 }]])).toBeNull();
  });

  it("recorta coordenadas fuera del encuadre", () => {
    const r = readRegions([
      [
        { x: -3, y: 0.2 },
        { x: 8, y: 0.2 },
        { x: 0.5, y: 44 },
      ],
    ]);
    expect(r).toEqual([
      [
        { x: 0, y: 0.2 },
        { x: 1, y: 0.2 },
        { x: 0.5, y: 1 },
      ],
    ]);
  });

  it("nunca devuelve más regiones de las que admite el equipo", () => {
    const muchas = Array.from({ length: 9 }, () => CUADRADO);
    expect(readRegions(muchas)).toHaveLength(MAX_REGIONS);
  });

  it("cero regiones válidas es `null` —fotograma completo— y no lista vacía", () => {
    expect(readRegions([])).toBeNull();
    expect(readRegions("nada")).toBeNull();
  });
});

describe("readWindow · lo que esta pantalla escribe y sabe releer", () => {
  it("exige dos horas HH:MM válidas", () => {
    expect(readWindow({ start: "25:99", end: "19:00", days: [1] })).toBeNull();
    expect(readWindow({ start: "08:00", days: [1] })).toBeNull();
  });

  it("los días llegan sin repetidos, ordenados y dentro de la semana", () => {
    expect(readWindow({ start: "08:00", end: "18:00", days: [5, 1, 1, 9, -2, 0] })?.days).toEqual([
      0, 1, 5,
    ]);
  });
});

describe("patchFromDraft · el cuerpo que viaja al servidor", () => {
  const draft: TuningDraft = {
    enabled: true,
    sensitivity: 40,
    alarmConfidence: "high",
    detectionTarget: "human,vehicle",
    regions: [CUADRADO],
    window: { start: "08:00", end: "20:00", days: [1, 2, 3] },
  };

  it("usa los nombres del contrato, no los de la pantalla", () => {
    const body = patchFromDraft(draft);
    expect(Object.keys(body).sort()).toEqual([
      "alarmConfidence",
      "detectionTarget",
      "enabled",
      "regions",
      "schedule",
      "sensitivity",
    ]);
  });

  it("sin regiones manda `null`, que es como el contrato dice «fotograma completo»", () => {
    // Omitir el campo significaría «no lo cambies»: son cosas distintas y el
    // servidor las distingue.
    expect(patchFromDraft({ ...draft, regions: [] }).regions).toBeNull();
  });

  it("las regiones viajan como array plano de vértices", () => {
    expect(patchFromDraft(draft).regions).toEqual([CUADRADO]);
  });
});

describe("isRouteMissing · «no hay endpoint» no es «no hay cámara»", () => {
  it("el 404 de Nest sin manejador significa que la funcionalidad no está", () => {
    expect(isRouteMissing(404, "Cannot GET /api/integra/cameras/x/detection")).toBe(true);
    expect(isRouteMissing(404, "")).toBe(true);
    expect(isRouteMissing(404, "HTTP 404")).toBe(true);
  });

  it("un 404 del propio endpoint es un error de verdad, no una funcionalidad ausente", () => {
    // El servicio contesta 404 cuando la cámara no está en el espejo. Tratarlo
    // como «aún no disponible» escondería un espejo desincronizado.
    expect(isRouteMissing(404, "Cámara cam-9 no está en el espejo")).toBe(false);
  });

  it("405 y 501 también son «todavía no publicado»", () => {
    expect(isRouteMissing(405, "Method Not Allowed")).toBe(true);
    expect(isRouteMissing(501, "Not Implemented")).toBe(true);
  });

  it("un 500 nunca es falta de endpoint", () => {
    expect(isRouteMissing(500, "boom")).toBe(false);
  });
});

describe("tuningProblems · qué impide guardar", () => {
  const base: TuningDraft = {
    enabled: true,
    sensitivity: 50,
    alarmConfidence: "mediumHigh",
    detectionTarget: "human",
    regions: [CUADRADO],
    window: { start: "00:00", end: "23:59", days: [0, 1, 2, 3, 4, 5, 6] },
  };

  it("una configuración razonable no tiene problemas", () => {
    expect(tuningProblems(base)).toEqual([]);
  });

  it("sin días marcados la detección no contaría nunca", () => {
    const p = tuningProblems({ ...base, window: { ...base.window, days: [] } });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/al menos uno/);
  });

  it("un polígono de dos puntos no encierra nada", () => {
    const p = tuningProblems({ ...base, regions: [CUADRADO.slice(0, 2)] });
    expect(p[0]).toMatch(new RegExp(`necesita ${MIN_POINTS}`));
  });

  it("respeta el tope de regiones que diga el servidor, no el de reserva", () => {
    const p = tuningProblems({ ...base, regions: [CUADRADO, CUADRADO, CUADRADO] }, {
      ...FALLBACK_LIMITS,
      maxRegions: 2,
    });
    expect(p[0]).toMatch(/admite 2 regiones/);
  });
});

describe("sensitivityMeaning · el número no dice nada solo", () => {
  it("cada tramo tiene una explicación distinta", () => {
    const etiquetas = [0, 30, 60, 80, 100].map((n) => sensitivityMeaning(n).label);
    expect(new Set(etiquetas).size).toBe(5);
  });

  it("el 100 —lo que se escribía a ciegas— se nombra como la causa del ruido", () => {
    expect(sensitivityMeaning(100).hint).toMatch(/ruido/);
  });
});

describe("geometría de regiones", () => {
  it("una región nueva no cubre el cuadro entero: eso es el problema, no la solución", () => {
    const r = newRegion([]);
    expect(r).toHaveLength(4);
    expect(areaFraction(r)).toBeLessThan(0.5);
  });

  it("dos regiones nuevas no salen apiladas", () => {
    const a = newRegion([]);
    const b = newRegion([a]);
    expect(b[0].x).toBeGreaterThan(a[0].x);
  });

  it("deja de admitir regiones al llegar al tope del equipo", () => {
    const cuatro = Array.from({ length: MAX_REGIONS }, () => CUADRADO);
    expect(canAddRegion(cuatro.slice(0, MAX_REGIONS - 1))).toBe(true);
    expect(canAddRegion(cuatro)).toBe(false);
    // Y si el servidor dice que son dos, son dos.
    expect(canAddRegion([CUADRADO, CUADRADO], 2)).toBe(false);
  });

  it("mover un vértice fuera del cuadro lo deja en el borde", () => {
    const movido = movePoint(CUADRADO, 0, { x: 3.4, y: -1 });
    expect(movido[0]).toEqual({ x: 1, y: 0 });
    expect(movido[2]).toEqual(CUADRADO[2]);
  });

  it("mover un vértice que no existe devuelve la misma región", () => {
    expect(movePoint(CUADRADO, 9, { x: 0.5, y: 0.5 })).toBe(CUADRADO);
  });

  it("partir un lado mete el vértice nuevo en su punto medio, no al final", () => {
    const partido = addPointAfter(CUADRADO, 0);
    expect(partido).toHaveLength(5);
    expect(partido[1]).toEqual({ x: 0.4, y: 0.2 });
  });

  it("no se puede pasar del tope de vértices", () => {
    let r: DetectionRegion = CUADRADO;
    for (let i = 0; i < 30; i++) r = addPointAfter(r, 0);
    expect(r.length).toBe(MAX_POINTS);
  });

  it("no se puede vaciar un polígono a base de borrar vértices", () => {
    let r: DetectionRegion = CUADRADO;
    for (let i = 0; i < 10; i++) r = removePoint(r, 0);
    expect(r.length).toBe(MIN_POINTS);
  });

  it("el área se calcula sobre el cuadro completo", () => {
    // 0.4 × 0.4 = 16 % del fotograma.
    expect(areaFraction(CUADRADO)).toBeCloseTo(0.16, 5);
  });

  it("el centro de un cuadrado es su centro", () => {
    const c = centroid(CUADRADO);
    expect(c.x).toBeCloseTo(0.4, 10);
    expect(c.y).toBeCloseTo(0.4, 10);
  });

  it("los puntos del polígono salen en el sistema del viewBox", () => {
    expect(polygonPoints(CUADRADO)).toBe("20.00,20.00 60.00,20.00 60.00,60.00 20.00,60.00");
  });

  it("con un cuadro 16:9 la X se estira y la Y no: así el vértice sale redondo", () => {
    expect(polygonPoints(CUADRADO, 16 / 9)).toBe(
      "35.56,20.00 106.67,20.00 106.67,60.00 35.56,60.00",
    );
  });

  it("un clic en píxeles se traduce a la fracción del cuadro", () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 };
    expect(toNormalized(300, 150, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(toNormalized(0, 0, rect)).toEqual({ x: 0, y: 0 });
    expect(toNormalized(9999, 9999, rect)).toEqual({ x: 1, y: 1 });
  });

  it("un cuadro sin medidas no divide por cero", () => {
    expect(toNormalized(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("ruido · contar lo que ya existe, sin inventar totales", () => {
  const ev = (type: string) => ({
    id: 1,
    deviceIp: "10.0.0.171",
    eventType: type,
    occurredAt: new Date().toISOString(),
  });

  it("agrupa por tipo de aviso, de más a menos frecuente", () => {
    const w = summarize({
      items: [ev("fielddetection"), ev("linedetection"), ev("fielddetection")],
      hasMore: false,
    });
    expect(w.count).toBe(3);
    expect(w.byType).toEqual([
      { type: "fielddetection", count: 2 },
      { type: "linedetection", count: 1 },
    ]);
  });

  it("cuando el servidor llega a su tope, la cifra se marca como cota inferior", () => {
    const w = summarize({ items: [ev("VMD")], hasMore: true });
    expect(w.capped).toBe(true);
    expect(countLabel(w)).toBe("1+");
  });

  it("sin tope, la cifra es la cifra", () => {
    expect(countLabel(summarize({ items: [ev("VMD")], hasMore: false }))).toBe("1");
  });

  it("una página vacía cuenta cero, no null", () => {
    expect(summarize({}).count).toBe(0);
  });

  it("los tipos conocidos se traducen y los desconocidos se enseñan crudos", () => {
    expect(typeLabel("fielddetection")).toBe("Intrusión en zona");
    expect(typeLabel("unattendedBaggage")).toBe("unattendedBaggage");
  });
});
