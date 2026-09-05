import { describe, expect, it } from "vitest";
import type { PushEvent } from "./_DetectionOverlay";
import {
  ALARM_KIND_LABEL,
  SEVERITY_RANK,
  alarmKindLabel,
  asSingleGroups,
  correlateEvents,
  groupDuplicateAlarms,
  isKnownAlarmKind,
  isPending,
  labelForRawKey,
  matchesStatusFilter,
  normalizeSeverity,
  normalizeStatus,
  occurrencesOf,
  outcomeOf,
  rawRecordTitle,
  sequenceStory,
  sortAlarms,
  sourceLabel,
  toKeyValues,
  type AlarmItem,
} from "./_soc";

/**
 * Pruebas de la lógica de la consola SOC.
 *
 * Contexto que explica por qué estas pruebas existen: el 94,3 % de lo que esta
 * cola llamaba «acceso denegado» era la puerta abriéndose y el botón de salida
 * (`integra-acs-codes.ts`). Corregido el backend, la cola queda casi vacía y lo
 * poco que llegue tiene que leerse bien a la primera. Todo lo de aquí es
 * aritmética y clasificación: exactamente lo que se rompe en silencio.
 */

function alarma(over: Partial<AlarmItem> = {}): AlarmItem {
  return {
    id: over.id ?? "soc:1",
    status: over.status ?? "OPEN",
    title: over.title ?? "Acceso denegado · Ana",
    severity: over.severity ?? "alta",
    timestamp: over.timestamp ?? "2026-09-05T10:00:00.000Z",
    ...over,
  };
}

function evento(over: Partial<PushEvent> & { id: number; occurredAt: string }): PushEvent {
  return {
    deviceIp: "192.168.9.10",
    eventType: "AccessControllerEvent",
    ...over,
  };
}

/* ── Tipos de alarma: lo que aún no existe y lo que nunca existirá ──────── */

describe("alarmKindLabel · un kind desconocido se pinta con dignidad", () => {
  it("traduce los dos tipos que el backend emite hoy", () => {
    expect(alarmKindLabel("DENIED")).toBe("Acceso denegado");
    expect(alarmKindLabel("AFTER_HOURS")).toBe("Entrada fuera de horario");
  });

  it("cubre TODO el `SocAlarmKind` del backend, sin caer al respaldo", () => {
    /**
     * Contrato con `integra-acs-alarms.policy.ts:50`. Si allí se añade un tipo
     * y aquí no, esta prueba no falla —el respaldo lo humaniza— pero la de
     * abajo sí: obliga a que cada tipo tenga etiqueta escrita a mano en
     * español. Fue así como se detectó `AUTH_FAILURE_BURST`, que no venía en
     * la lista original de seis.
     */
    const DEL_BACKEND = [
      "DENIED",
      "AFTER_HOURS",
      "DOOR_FORCED",
      "DOOR_HELD_OPEN",
      "ANTIPASSBACK",
      "CREDENTIAL_EXPIRED",
      "BLOCKLIST",
      "AUTH_FAILURE_BURST",
      "CAMERA_TAMPER",
    ];
    for (const kind of DEL_BACKEND) {
      expect(isKnownAlarmKind(kind), `falta etiqueta en español para ${kind}`).toBe(true);
    }
  });

  it("traduce los tipos nuevos a español de verdad, no a un enum despiezado", () => {
    expect(alarmKindLabel("DOOR_FORCED")).toBe("Puerta forzada");
    expect(alarmKindLabel("DOOR_HELD_OPEN")).toBe("Puerta mantenida abierta");
    expect(alarmKindLabel("ANTIPASSBACK")).toBe("Antipassback");
    expect(alarmKindLabel("CREDENTIAL_EXPIRED")).toBe("Credencial caducada");
    expect(alarmKindLabel("BLOCKLIST")).toBe("Persona en lista negra");
    expect(alarmKindLabel("AUTH_FAILURE_BURST")).toBe("Ráfaga de fallos de reconocimiento");
    expect(alarmKindLabel("CAMERA_TAMPER")).toBe("Sabotaje de cámara");
  });

  it("un kind que nadie ha anunciado sale legible, nunca como enum crudo", () => {
    // Esto es el caso que importa: alguien añade un tipo mañana y esta pantalla
    // no se ha vuelto a desplegar. Feo pero legible es aceptable; `TAILGATING`
    // a pelo en una tabla, no.
    expect(alarmKindLabel("TAILGATING")).toBe("Tailgating");
    expect(alarmKindLabel("DURESS_CODE_USED")).toBe("Duress code used");
    expect(alarmKindLabel("fireAlarmTriggered")).toBe("Fire alarm triggered");
    expect(alarmKindLabel("SOMETHING_VERY_NEW")).not.toContain("_");
  });

  it("sin kind cae al eventType, que es lo que fabrica el backend", () => {
    expect(alarmKindLabel(null, "acs.after_hours")).toBe("Entrada fuera de horario");
    expect(alarmKindLabel(null, "acs.denied")).toBe("Acceso denegado");
    expect(alarmKindLabel(null, "acs.puerta_forzada")).toBe("Puerta forzada");
  });

  it("sin kind ni eventType devuelve cadena vacía, no «undefined»", () => {
    expect(alarmKindLabel(null)).toBe("");
    expect(alarmKindLabel(undefined, undefined)).toBe("");
    expect(alarmKindLabel("   ", "  ")).toBe("");
  });

  it("isKnownAlarmKind distingue lo que este bundle sabe explicar", () => {
    expect(isKnownAlarmKind("DENIED")).toBe(true);
    expect(isKnownAlarmKind("BLOCKLIST")).toBe(true);
    expect(isKnownAlarmKind("TAILGATING")).toBe(false);
    expect(isKnownAlarmKind(null)).toBe(false);
    expect(isKnownAlarmKind("")).toBe(false);
  });

  it("el catálogo no se puede mutar desde una pantalla", () => {
    expect(Object.isFrozen(ALARM_KIND_LABEL)).toBe(true);
  });
});

/* ── Severidad ──────────────────────────────────────────────────────────── */

describe("normalizeSeverity · severidad que se pueda ordenar", () => {
  it("acepta lo que manda el backend en español y en inglés", () => {
    expect(normalizeSeverity("alta")).toBe("alta");
    expect(normalizeSeverity("HIGH")).toBe("alta");
    expect(normalizeSeverity("Media")).toBe("media");
    expect(normalizeSeverity("low")).toBe("baja");
  });

  it("lo que no reconoce es «desconocida», no «baja»", () => {
    // Degradar a «baja» un valor nuevo escondería una alarma grave al ordenar.
    expect(normalizeSeverity("critica")).toBe("desconocida");
    expect(normalizeSeverity(null)).toBe("desconocida");
    expect(normalizeSeverity("")).toBe("desconocida");
  });

  it("el peso ordena alta > media > baja > desconocida", () => {
    expect(SEVERITY_RANK.alta).toBeGreaterThan(SEVERITY_RANK.media);
    expect(SEVERITY_RANK.media).toBeGreaterThan(SEVERITY_RANK.baja);
    expect(SEVERITY_RANK.baja).toBeGreaterThan(SEVERITY_RANK.desconocida);
  });
});

/* ── Estado del flujo de atención ───────────────────────────────────────── */

describe("normalizeStatus y filtros de estado", () => {
  it("reconoce los cuatro estados del modelo", () => {
    expect(normalizeStatus("OPEN")).toBe("OPEN");
    expect(normalizeStatus("ack")).toBe("ACK");
    expect(normalizeStatus("TICKETED")).toBe("TICKETED");
    expect(normalizeStatus("CLEARED")).toBe("CLEARED");
    expect(normalizeStatus("ZZZ")).toBe("OTRO");
  });

  it("«pendiente» es lo mismo que cuenta openCount en el backend: OPEN + TICKETED", () => {
    expect(isPending("OPEN")).toBe(true);
    expect(isPending("TICKETED")).toBe(true);
    expect(isPending("ACK")).toBe(false);
    expect(isPending("CLEARED")).toBe(false);
  });

  it("el filtro PENDIENTES agrupa nuevas y escaladas", () => {
    expect(matchesStatusFilter("OPEN", "PENDIENTES")).toBe(true);
    expect(matchesStatusFilter("TICKETED", "PENDIENTES")).toBe(true);
    expect(matchesStatusFilter("ACK", "PENDIENTES")).toBe(false);
    expect(matchesStatusFilter("CLEARED", "TODAS")).toBe(true);
  });
});

/* ── Orden ──────────────────────────────────────────────────────────────── */

describe("sortAlarms · una cola que no baraja al reordenar", () => {
  const filas = [
    alarma({ id: "a", severity: "baja", timestamp: "2026-09-05T10:00:00Z", occurrenceCount: 9 }),
    alarma({ id: "b", severity: "alta", timestamp: "2026-09-05T09:00:00Z", occurrenceCount: 2 }),
    alarma({ id: "c", severity: "media", timestamp: "2026-09-05T11:00:00Z", occurrenceCount: 5 }),
  ];

  it("por severidad descendente pone lo grave arriba", () => {
    expect(sortAlarms(filas, "sev", "desc").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("por repeticiones descendente pone lo insistente arriba", () => {
    expect(sortAlarms(filas, "dups", "desc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("por hora descendente pone lo reciente arriba", () => {
    expect(sortAlarms(filas, "time", "desc").map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("invertir la dirección invierte el resultado", () => {
    expect(sortAlarms(filas, "sev", "asc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("con empate desempata por hora y luego por id: el orden es estable", () => {
    // Sin desempate determinista la tabla se reordena sola en cada refresco de
    // 7 s y el operador pierde la fila que estaba mirando.
    const empatadas = [
      alarma({ id: "z", severity: "alta", timestamp: "2026-09-05T10:00:00Z" }),
      alarma({ id: "y", severity: "alta", timestamp: "2026-09-05T10:00:00Z" }),
    ];
    const uno = sortAlarms(empatadas, "sev", "desc").map((r) => r.id);
    const dos = sortAlarms([...empatadas].reverse(), "sev", "desc").map((r) => r.id);
    expect(uno).toEqual(dos);
  });

  it("no muta el array que recibe", () => {
    const original = filas.map((r) => r.id);
    sortAlarms(filas, "sev", "desc");
    expect(filas.map((r) => r.id)).toEqual(original);
  });
});

/* ── Agrupación de duplicados ───────────────────────────────────────────── */

describe("groupDuplicateAlarms · veinte avisos son una fila con contador", () => {
  const VENTANA = 5 * 60_000;

  it("fusiona la misma puerta, persona y tipo dentro de la ventana", () => {
    const grupos = groupDuplicateAlarms(
      [
        alarma({ id: "1", kind: "DENIED", personId: "p1", doorNo: 3, timestamp: "2026-09-05T10:00:00Z" }),
        alarma({ id: "2", kind: "DENIED", personId: "p1", doorNo: 3, timestamp: "2026-09-05T10:01:00Z" }),
        alarma({ id: "3", kind: "DENIED", personId: "p1", doorNo: 3, timestamp: "2026-09-05T10:02:00Z" }),
      ],
      VENTANA,
    );
    expect(grupos).toHaveLength(1);
    expect(grupos[0].members).toHaveLength(3);
    expect(grupos[0].totalOccurrences).toBe(3);
  });

  it("suma las repeticiones que YA contó el backend, no las recuenta", () => {
    // `occurrenceCount` lo agrega `alarmFingerprint()` en el API. Ignorarlo y
    // contar filas daría «×2» donde de verdad hubo 336 ocurrencias.
    const grupos = groupDuplicateAlarms(
      [
        alarma({ id: "1", kind: "DENIED", personId: "p1", doorNo: 3, occurrenceCount: 200, timestamp: "2026-09-05T10:00:00Z" }),
        alarma({ id: "2", kind: "DENIED", personId: "p1", doorNo: 3, occurrenceCount: 136, timestamp: "2026-09-05T10:01:00Z" }),
      ],
      VENTANA,
    );
    expect(grupos).toHaveLength(1);
    expect(grupos[0].totalOccurrences).toBe(336);
  });

  it("NO fusiona alarmas con distinto estado", () => {
    // Esconder una nueva detrás de una ya atendida sería mentir al operador.
    const grupos = groupDuplicateAlarms(
      [
        alarma({ id: "1", status: "OPEN", kind: "DENIED", personId: "p1", doorNo: 3, timestamp: "2026-09-05T10:00:00Z" }),
        alarma({ id: "2", status: "ACK", kind: "DENIED", personId: "p1", doorNo: 3, timestamp: "2026-09-05T10:01:00Z" }),
      ],
      VENTANA,
    );
    expect(grupos).toHaveLength(2);
  });

  it("NO fusiona puertas distintas ni personas distintas", () => {
    const otraPuerta = groupDuplicateAlarms(
      [
        alarma({ id: "1", kind: "DENIED", personId: "p1", doorNo: 3, timestamp: "2026-09-05T10:00:00Z" }),
        alarma({ id: "2", kind: "DENIED", personId: "p1", doorNo: 4, timestamp: "2026-09-05T10:00:30Z" }),
      ],
      VENTANA,
    );
    expect(otraPuerta).toHaveLength(2);

    const otraPersona = groupDuplicateAlarms(
      [
        alarma({ id: "1", kind: "DENIED", personId: "p1", doorNo: 3, timestamp: "2026-09-05T10:00:00Z" }),
        alarma({ id: "2", kind: "DENIED", personId: "p2", doorNo: 3, timestamp: "2026-09-05T10:00:30Z" }),
      ],
      VENTANA,
    );
    expect(otraPersona).toHaveLength(2);
  });

  it("fuera de la ventana son sucesos distintos", () => {
    const grupos = groupDuplicateAlarms(
      [
        alarma({ id: "1", kind: "DENIED", personId: "p1", doorNo: 3, timestamp: "2026-09-05T10:00:00Z" }),
        alarma({ id: "2", kind: "DENIED", personId: "p1", doorNo: 3, timestamp: "2026-09-05T12:00:00Z" }),
      ],
      VENTANA,
    );
    expect(grupos).toHaveLength(2);
  });

  it("la foto y la nota se rescatan de cualquiera de las repetidas", () => {
    const grupos = groupDuplicateAlarms(
      [
        alarma({ id: "1", kind: "DENIED", personId: "p1", doorNo: 3, timestamp: "2026-09-05T10:01:00Z" }),
        alarma({ id: "2", kind: "DENIED", personId: "p1", doorNo: 3, timestamp: "2026-09-05T10:00:00Z", photoPath: "/f.jpg", note: "revisar" }),
      ],
      VENTANA,
    );
    expect(grupos[0].photoPath).toBe("/f.jpg");
    expect(grupos[0].note).toBe("revisar");
  });

  it("sin agrupar, cada alarma conserva la forma de grupo", () => {
    // La tabla tiene un solo camino de render: agrupar o no, el dato es igual.
    const sueltas = asSingleGroups([alarma({ id: "1", occurrenceCount: 7 })]);
    expect(sueltas).toHaveLength(1);
    expect(sueltas[0].totalOccurrences).toBe(7);
    expect(sueltas[0].members).toHaveLength(1);
  });

  it("occurrencesOf nunca devuelve cero ni negativo", () => {
    expect(occurrencesOf(alarma({ occurrenceCount: null }))).toBe(1);
    expect(occurrencesOf(alarma({ occurrenceCount: 0 }))).toBe(1);
    expect(occurrencesOf(alarma({ occurrenceCount: 12 }))).toBe(12);
  });
});

/* ── Origen legible ─────────────────────────────────────────────────────── */

describe("sourceLabel · el nombre de la puerta antes que su código", () => {
  it("prefiere el nombre humano al identificador", () => {
    expect(sourceLabel(alarma({ doorName: "Acceso General", doorNo: 3 }))).toBe("Acceso General");
    expect(sourceLabel(alarma({ doorNo: 3 }))).toBe("Puerta 3");
    expect(sourceLabel(alarma({ deviceIp: "192.168.9.10" }))).toBe("192.168.9.10");
  });

  it("sin nada que decir devuelve cadena vacía, no «null»", () => {
    expect(sourceLabel(alarma())).toBe("");
  });
});

/* ── JSON crudo → pares legibles ────────────────────────────────────────── */

describe("toKeyValues · fuera el JSON crudo de la pantalla", () => {
  it("traduce las claves conocidas de Artemis al español", () => {
    const pares = toKeyValues({ doorName: "Recepción", personName: "Ana" });
    expect(pares.find((p) => p.key === "doorName")?.label).toBe("Puerta");
    expect(pares.find((p) => p.key === "personName")?.label).toBe("Persona");
  });

  it("una clave que no conoce se humaniza en vez de salir en camelCase", () => {
    expect(labelForRawKey("svcIndexCode")).toBe("Svc Index Code");
    expect(labelForRawKey("eventId")).toBe("ID de evento");
  });

  it("marca los campos vacíos en vez de pintar «null»", () => {
    const pares = toKeyValues({ doorName: null, personName: "" });
    expect(pares.every((p) => p.empty)).toBe(true);
    expect(pares.some((p) => p.value.includes("null"))).toBe(false);
  });

  it("baja un nivel en los objetos anidados", () => {
    const pares = toKeyValues({ persona: { nombre: "Ana", id: "p1" } });
    expect(pares.map((p) => p.key)).toContain("persona.nombre");
    expect(pares.find((p) => p.key === "persona.nombre")?.value).toBe("Ana");
  });

  it("une los arrays de escalares y remite los complejos al crudo", () => {
    const escalares = toKeyValues({ puertas: ["A", "B"] });
    expect(escalares[0].value).toBe("A · B");
    const complejo = toKeyValues({ cosas: [{ x: 1 }, { x: 2 }] });
    expect(complejo[0].value).toContain("2 elementos");
  });

  it("respeta el límite para no volcar un payload entero en la ficha", () => {
    const gordo: Record<string, string> = {};
    for (let i = 0; i < 60; i += 1) gordo[`k${i}`] = String(i);
    expect(toKeyValues(gordo, 10)).toHaveLength(10);
  });

  it("lo que no es un objeto no produce pares", () => {
    expect(toKeyValues(null)).toEqual([]);
    expect(toKeyValues("texto")).toEqual([]);
    expect(toKeyValues([1, 2, 3])).toEqual([]);
  });

  it("el título del registro sigue la misma prioridad que el backend", () => {
    expect(rawRecordTitle({ eventTypeName: "Denegado", srcName: "Puerta 1" })).toBe("Denegado");
    expect(rawRecordTitle({ srcName: "Puerta 1" })).toBe("Puerta 1");
    expect(rawRecordTitle(null)).toBe("Registro");
  });
});

/* ── Correlación de eventos ─────────────────────────────────────────────── */

describe("correlateEvents · la misma puerta y el mismo minuto son una historia", () => {
  const VENTANA = 60_000;

  it("agrupa los eventos seguidos de una misma puerta", () => {
    const seqs = correlateEvents(
      [
        evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", doorNo: 1, outcome: "denied" }),
        evento({ id: 2, occurredAt: "2026-09-05T10:00:20Z", doorNo: 1, outcome: "denied" }),
        evento({ id: 3, occurredAt: "2026-09-05T10:00:40Z", doorNo: 1, outcome: "granted", personName: "Ana" }),
      ],
      VENTANA,
    );
    expect(seqs).toHaveLength(1);
    expect(seqs[0].events).toHaveLength(3);
    expect(seqs[0].denied).toBe(2);
    expect(seqs[0].granted).toBe(1);
  });

  it("el primer silencio mayor que la ventana corta la secuencia", () => {
    const seqs = correlateEvents(
      [
        evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", doorNo: 1 }),
        evento({ id: 2, occurredAt: "2026-09-05T10:00:30Z", doorNo: 1 }),
        evento({ id: 3, occurredAt: "2026-09-05T10:10:00Z", doorNo: 1 }),
      ],
      VENTANA,
    );
    expect(seqs).toHaveLength(2);
  });

  it("dos puertas distintas nunca se mezclan aunque coincidan en el tiempo", () => {
    const seqs = correlateEvents(
      [
        evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", doorNo: 1 }),
        evento({ id: 2, occurredAt: "2026-09-05T10:00:01Z", doorNo: 2 }),
      ],
      VENTANA,
    );
    expect(seqs).toHaveLength(2);
  });

  it("distingue puertas por IP de terminal, no solo por número", () => {
    const seqs = correlateEvents(
      [
        evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", deviceIp: "192.168.9.10", doorNo: 1 }),
        evento({ id: 2, occurredAt: "2026-09-05T10:00:01Z", deviceIp: "192.168.9.11", doorNo: 1 }),
      ],
      VENTANA,
    );
    expect(seqs).toHaveLength(2);
  });

  it("la secuencia se pinta de la más reciente a la más antigua", () => {
    const seqs = correlateEvents(
      [
        evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", doorNo: 1 }),
        evento({ id: 2, occurredAt: "2026-09-05T10:00:30Z", doorNo: 1 }),
      ],
      VENTANA,
    );
    expect(seqs[0].events.map((e) => e.id)).toEqual([2, 1]);
  });

  it("las secuencias más recientes van primero", () => {
    const seqs = correlateEvents(
      [
        evento({ id: 1, occurredAt: "2026-09-05T09:00:00Z", doorNo: 1 }),
        evento({ id: 2, occurredAt: "2026-09-05T11:00:00Z", doorNo: 2 }),
      ],
      VENTANA,
    );
    expect(seqs[0].events[0].id).toBe(2);
  });

  it("descarta fechas ilegibles sin tirar la lista entera", () => {
    const seqs = correlateEvents(
      [
        evento({ id: 1, occurredAt: "no-es-una-fecha", doorNo: 1 }),
        evento({ id: 2, occurredAt: "2026-09-05T10:00:00Z", doorNo: 1 }),
      ],
      VENTANA,
    );
    expect(seqs).toHaveLength(1);
    expect(seqs[0].events.map((e) => e.id)).toEqual([2]);
  });

  it("sin eventos no devuelve secuencias", () => {
    expect(correlateEvents([], VENTANA)).toEqual([]);
  });

  it("denegado seguido de concedido es el caso que hay que mirar", () => {
    // Alguien insistió y acabó entrando: eso es una historia, no tres filas.
    const [seq] = correlateEvents(
      [
        evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", doorNo: 1, outcome: "denied" }),
        evento({ id: 2, occurredAt: "2026-09-05T10:00:30Z", doorNo: 1, outcome: "granted", personName: "Ana" }),
      ],
      VENTANA,
    );
    expect(seq.tone).toBe("danger");
    expect(sequenceStory(seq)).toContain("denegado");
    expect(sequenceStory(seq)).toContain("Ana");
  });

  it("un paso concedido normal no se pinta como problema", () => {
    const [seq] = correlateEvents(
      [evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", doorNo: 1, outcome: "granted", personName: "Ana" })],
      VENTANA,
    );
    expect(seq.tone).toBe("ok");
    expect(seq.people).toEqual(["Ana"]);
  });

  it("un solo denegado avisa, pero no como dos seguidos", () => {
    const [uno] = correlateEvents(
      [evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", doorNo: 1, outcome: "denied" })],
      VENTANA,
    );
    expect(uno.tone).toBe("warn");

    const [dos] = correlateEvents(
      [
        evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", doorNo: 1, outcome: "denied" }),
        evento({ id: 2, occurredAt: "2026-09-05T10:00:10Z", doorNo: 1, outcome: "denied" }),
      ],
      VENTANA,
    );
    expect(dos.tone).toBe("danger");
  });

  it("sin identidad ACS lo dice, no inventa un nombre", () => {
    const [seq] = correlateEvents(
      [evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", doorNo: 1, outcome: "granted" })],
      VENTANA,
    );
    expect(sequenceStory(seq)).toContain("sin identidad ACS");
  });
});

describe("outcomeOf · el resultado sale del campo, y solo si no está, de la etiqueta", () => {
  it("respeta el outcome que manda el backend", () => {
    expect(outcomeOf(evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", outcome: "denied" }))).toBe("denied");
    expect(outcomeOf(evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", outcome: "granted" }))).toBe("granted");
  });

  it("sin outcome se apoya en la etiqueta en español", () => {
    expect(outcomeOf(evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", label: "Acceso denegado" }))).toBe("denied");
    expect(outcomeOf(evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", label: "Acceso concedido" }))).toBe("granted");
  });

  it("lo que no es ni una cosa ni otra es «other», no «denied»", () => {
    // Meter el estado de la puerta en el cubo de las denegaciones fue
    // exactamente el error que infló el KPI al 94,3 %.
    expect(outcomeOf(evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", label: "Puerta abierta" }))).toBe("other");
    expect(outcomeOf(evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z", label: "Botón de salida" }))).toBe("other");
    expect(outcomeOf(evento({ id: 1, occurredAt: "2026-09-05T10:00:00Z" }))).toBe("other");
  });
});
