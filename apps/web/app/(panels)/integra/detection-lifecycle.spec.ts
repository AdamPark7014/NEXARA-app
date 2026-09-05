import { describe, expect, it } from "vitest";
import {
  boxesFromEvents,
  closeBoxes,
  closersFor,
  eventStateOf,
  mergeBoxes,
  repeatsOf,
  tagPlacement,
  type PushEvent,
} from "./_DetectionOverlay";

/**
 * El ciclo de vida de una caja de detección.
 *
 * Esto es lo que producía los fantasmas: la caja se iba cuando vencía un
 * temporizador, no cuando la persona se iba. El equipo lo dice —`eventState`—
 * y ahora se lee. Pero el backend que lo expone se está escribiendo en
 * paralelo, así que la mitad de estas pruebas comprueban justo lo contrario:
 * que sin el campo el comportamiento sea exactamente el de antes.
 */

const IP = "10.0.0.171";
const OTRA_IP = "10.0.0.172";

let seq = 0;

function evento(over: Partial<PushEvent> = {}): PushEvent {
  seq += 1;
  return {
    id: seq,
    deviceIp: IP,
    eventType: "fielddetection",
    occurredAt: new Date().toISOString(),
    targets: [{ type: "human", x: 0.2, y: 0.2, w: 0.2, h: 0.4 }],
    ...over,
  };
}

describe("eventStateOf · leer el estado sin inventarlo", () => {
  it("sin el campo devuelve null, que es lo que hace mandar al TTL", () => {
    expect(eventStateOf(evento())).toBeNull();
  });

  it("null explícito del backend tampoco es un estado", () => {
    expect(eventStateOf(evento({ eventState: null }))).toBeNull();
  });

  it("lee los dos valores que documenta el fabricante", () => {
    expect(eventStateOf(evento({ eventState: "active" }))).toBe("active");
    expect(eventStateOf(evento({ eventState: "inactive" }))).toBe("inactive");
  });
});

describe("repeatsOf · agrupar repeticiones en vez de contar cajas", () => {
  it("sin activePostCount cuenta una: la que llegó", () => {
    expect(repeatsOf(evento())).toBe(1);
  });

  it("toma el contador del equipo tal cual", () => {
    expect(repeatsOf(evento({ activePostCount: 7 }))).toBe(7);
  });

  it("un contador absurdo no se pinta como repetición", () => {
    expect(repeatsOf(evento({ activePostCount: 0 }))).toBe(1);
    expect(repeatsOf(evento({ activePostCount: -3 }))).toBe(1);
    expect(repeatsOf(evento({ activePostCount: Number.NaN }))).toBe(1);
  });
});

describe("boxesFromEvents · qué abre una caja", () => {
  it("un evento normal abre su caja (comportamiento de siempre)", () => {
    expect(boxesFromEvents([evento()], IP)).toHaveLength(1);
  });

  it("un `inactive` no abre nada: dice que se acabó", () => {
    expect(boxesFromEvents([evento({ eventState: "inactive" })], IP)).toHaveLength(0);
  });

  it("`active` abre y deja la caja marcada como gobernada por el equipo", () => {
    const [caja] = boxesFromEvents([evento({ eventState: "active" })], IP);
    expect(caja.stated).toBe(true);
  });

  it("sin el campo la caja queda a merced del TTL, como antes", () => {
    const [caja] = boxesFromEvents([evento()], IP);
    expect(caja.stated).toBe(false);
    expect(caja.ttl).toBeGreaterThan(0);
  });

  it("guarda el tipo de aviso, que es lo que permite cerrarla luego", () => {
    const [caja] = boxesFromEvents([evento({ eventType: "linedetection" })], IP);
    expect(caja.eventType).toBe("linedetection");
  });

  it("lleva las repeticiones a la caja", () => {
    const [caja] = boxesFromEvents([evento({ activePostCount: 12 })], IP);
    expect(caja.repeats).toBe(12);
  });
});

describe("closersFor · de quién es el cierre", () => {
  it("solo los `inactive` de esta cámara", () => {
    const lote = [
      evento({ eventState: "inactive" }),
      evento({ eventState: "active" }),
      evento({ deviceIp: OTRA_IP, eventState: "inactive" }),
      evento(),
    ];
    const cierres = closersFor(lote, IP);
    expect(cierres).toHaveLength(1);
    expect(cierres[0].deviceIp).toBe(IP);
  });
});

describe("closeBoxes · la caja se retira cuando el equipo lo dice", () => {
  it("con rectángulo cierra solo la que se solapa: los demás siguen ahí", () => {
    // Sala de juntas: tres personas sentadas lejos entre sí. Que una se vaya
    // no puede borrar a las otras dos — ese era el bug de la heurística.
    const abiertas = mergeBoxes(
      [],
      boxesFromEvents(
        [
          evento({ targets: [{ type: "human", x: 0.05, y: 0.3, w: 0.12, h: 0.3 }] }),
          evento({ targets: [{ type: "human", x: 0.45, y: 0.3, w: 0.12, h: 0.3 }] }),
          evento({ targets: [{ type: "human", x: 0.8, y: 0.3, w: 0.12, h: 0.3 }] }),
        ],
        IP,
      ),
    );
    expect(abiertas).toHaveLength(3);

    const cierre = evento({
      eventState: "inactive",
      targets: [{ type: "human", x: 0.45, y: 0.3, w: 0.12, h: 0.3 }],
    });
    const quedan = closeBoxes(abiertas, [cierre]);
    expect(quedan).toHaveLength(2);
    expect(quedan.map((b) => b.x)).toEqual([0.05, 0.8]);
  });

  it("sin rectángulo cierra las cajas ópticas de ese mismo aviso", () => {
    const abiertas = mergeBoxes(
      [],
      boxesFromEvents(
        [
          evento({ eventType: "fielddetection", targets: [{ type: "human", x: 0.1, y: 0.1, w: 0.1, h: 0.2 }] }),
          evento({ eventType: "linedetection", targets: [{ type: "human", x: 0.7, y: 0.1, w: 0.1, h: 0.2 }] }),
        ],
        IP,
      ),
    );
    const quedan = closeBoxes(abiertas, [
      evento({ eventType: "fielddetection", eventState: "inactive", targets: null }),
    ]);
    expect(quedan).toHaveLength(1);
    expect(quedan[0].eventType).toBe("linedetection");
  });

  it("un cierre sin rectángulo no borra un pase de accesos", () => {
    // Un acceso ACS es un instante, no un estado que se apague: si un aviso
    // óptico termina, la identidad reconocida hace dos segundos sigue valiendo.
    const acs = mergeBoxes(
      [],
      boxesFromEvents(
        [
          evento({
            eventType: "AccessControllerEvent",
            major: 5,
            minor: 75,
            personName: "Ana Ruiz",
            targets: [{ type: "face", x: 0.4, y: 0.2, w: 0.1, h: 0.15 }],
          }),
        ],
        IP,
      ),
    );
    expect(acs).toHaveLength(1);
    const quedan = closeBoxes(acs, [
      evento({ eventType: "AccessControllerEvent", eventState: "inactive", targets: null }),
    ]);
    expect(quedan).toHaveLength(1);
  });

  it("si no cierra nada devuelve el mismo array, para no repintar de balde", () => {
    const abiertas = mergeBoxes([], boxesFromEvents([evento()], IP));
    const quedan = closeBoxes(abiertas, [
      evento({ eventState: "inactive", targets: [{ type: "human", x: 0.9, y: 0.9, w: 0.05, h: 0.05 }] }),
    ]);
    expect(quedan).toBe(abiertas);
  });

  it("sin cierres y sin cajas no hace nada", () => {
    expect(closeBoxes([], [])).toEqual([]);
  });
});

describe("mergeBoxes · repeticiones y estado al fusionar", () => {
  it("se queda con el mayor contador de repeticiones, no los suma", () => {
    // `activePostCount` ya es absoluto para esa alarma: sumarlo lo inflaría.
    const primera = boxesFromEvents([evento({ activePostCount: 3 })], IP);
    const segunda = boxesFromEvents([evento({ activePostCount: 5 })], IP);
    const [caja] = mergeBoxes(primera, segunda);
    expect(caja.repeats).toBe(5);

    const [vuelta] = mergeBoxes(mergeBoxes(primera, segunda), primera);
    expect(vuelta.repeats).toBe(5);
  });

  it("una vez que el equipo habló, un aviso mudo no devuelve la caja al TTL", () => {
    const conEstado = boxesFromEvents([evento({ eventState: "active" })], IP);
    const sinEstado = boxesFromEvents([evento()], IP);
    const [caja] = mergeBoxes(conEstado, sinEstado);
    expect(caja.stated).toBe(true);
  });
});

describe("coste del lote · el overlay no puede pagar el ciclo de vida con fluidez", () => {
  /**
   * La capa está optimizada a propósito: un solo canal compartido, fan-out
   * agrupado y pintado limitado por rAF. Leer `eventState` añade dos pasadas
   * por el lote y una por las cajas vivas (que son 12 como mucho), y eso no
   * puede notarse. El presupuesto es generosísimo justo para que la prueba
   * falle solo si alguien mete algo cuadrático aquí dentro.
   */
  it("una ráfaga de 200 eventos se procesa muy por debajo de un fotograma", () => {
    const lote: PushEvent[] = [];
    for (let i = 0; i < 200; i++) {
      lote.push(
        evento({
          eventState: i % 5 === 0 ? "inactive" : "active",
          activePostCount: (i % 7) + 1,
          targets: [{ type: "human", x: (i % 10) / 10, y: 0.3, w: 0.08, h: 0.25 }],
        }),
      );
    }
    const t0 = performance.now();
    for (let vuelta = 0; vuelta < 20; vuelta++) {
      const abren = boxesFromEvents(lote, IP);
      const cierran = closersFor(lote, IP);
      closeBoxes(mergeBoxes([], abren), cierran);
    }
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  it("un lote de otra cámara no toca ni una caja: ni fusión ni cierre", () => {
    // Es la propiedad que evita repintados de balde en el muro de 16 celdas:
    // cada overlay solo reacciona a lo suyo.
    const vivas = mergeBoxes([], boxesFromEvents([evento()], IP));
    const ajeno = [evento({ deviceIp: OTRA_IP, eventState: "inactive", targets: null })];
    expect(boxesFromEvents(ajeno, IP)).toHaveLength(0);
    expect(closersFor(ajeno, IP)).toHaveLength(0);
    expect(closeBoxes(vivas, closersFor(ajeno, IP))).toBe(vivas);
  });
});

describe("tagPlacement · la placa no se sale del cuadro", () => {
  const caja = (x: number, y: number, w = 0.1) =>
    boxesFromEvents([evento({ targets: [{ type: "human", x, y, w, h: 0.2 }] })], IP)[0];

  it("caso normal: encima de la caja y anclada a la izquierda", () => {
    expect(tagPlacement(caja(0.2, 0.4))).toEqual({ place: "above", align: "left" });
  });

  it("pegada al techo se mete dentro: encima no hay sitio", () => {
    expect(tagPlacement(caja(0.2, 0.02)).place).toBe("inside");
  });

  it("en el tercio derecho ancla por la derecha", () => {
    expect(tagPlacement(caja(0.75, 0.4)).align).toBe("right");
  });

  it("una caja ancha que termina en el borde también ancla a la derecha", () => {
    // Empieza a la izquierda —ancla izquierda «legal»— pero mide casi todo el
    // cuadro: el texto se saldría por la derecha igual.
    expect(tagPlacement(caja(0.4, 0.4, 0.55)).align).toBe("right");
  });
});
