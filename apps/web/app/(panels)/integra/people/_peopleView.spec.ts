import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTERS,
  WARN_DAYS,
  credentialScore,
  describeCredentials,
  describeError,
  describeValidity,
  doorOptions,
  faceOn,
  filterPeople,
  flattenDetail,
  isIndefiniteEnd,
  personDoors,
  personMatches,
  sortPeople,
  userTypeLabel,
  userTypeOptions,
  type PeopleFilters,
  type Person,
} from "./_peopleView";

/**
 * Por qué existen estas pruebas.
 *
 * La consola de Personas decide, con tres campos sueltos que manda un terminal
 * Hikvision, si alguien pasa o no pasa por una puerta. Ese criterio estaba
 * escrito tres veces —listado, tabla y ficha— y las tres decían cosas distintas
 * de la misma persona. Ahora vive en un solo módulo sin React, y esto lo fija:
 * si alguien cambia el umbral, invierte el orden de urgencia o se olvida de que
 * `validEnable=false` manda sobre la fecha, se entera aquí y no en la puerta.
 *
 * `AHORA` es fijo a propósito: una prueba de vigencia que dependa del reloj de
 * quien la corre no prueba nada.
 */

const AHORA = Date.parse("2026-09-05T12:00:00Z");
const DIA = 86_400_000;

/** ISO del día que cae a `dias` de `AHORA`. Negativo = pasado. */
function enDias(dias: number): string {
  return new Date(AHORA + dias * DIA).toISOString();
}

function persona(patch: Partial<Person> = {}): Person {
  return { id: "1001", name: "Ada Lovelace", ...patch };
}

describe("Vigencia · qué significa de verdad", () => {
  it("una persona suspendida se llama suspendida, no «vencida»", () => {
    const v = describeValidity(persona({ validEnable: false, validTo: enDias(400) }), AHORA);
    expect(v.key).toBe("off");
    expect(v.label).toBe("Suspendida");
    expect(v.tone).toBe("danger");
  });

  it("la suspensión manda sobre la fecha: aunque esté caducada, lo que la para es el interruptor", () => {
    // Las dos condiciones se dan a la vez. Decir «Caducada» mandaría a renovar
    // la fecha a alguien a quien no le va a servir de nada: sigue apagada.
    const v = describeValidity(persona({ validEnable: false, validTo: enDias(-10) }), AHORA);
    expect(v.key).toBe("off");
  });

  it("sin fecha de fin no se inventa un estado: se dice que no llegó", () => {
    const v = describeValidity(persona(), AHORA);
    expect(v.key).toBe("unknown");
    expect(v.tone).toBe("neutral");
  });

  it("una fecha que el terminal devuelve rota se enseña tal cual en el motivo", () => {
    const v = describeValidity(persona({ validTo: "no-es-una-fecha" }), AHORA);
    expect(v.key).toBe("unknown");
    expect(v.meaning).toContain("no-es-una-fecha");
  });

  it("caducada dice cuántos días lleva sin abrir", () => {
    const v = describeValidity(persona({ validTo: enDias(-3) }), AHORA);
    expect(v.key).toBe("expired");
    expect(v.daysLeft).toBe(-3);
    expect(v.meaning).toContain("3 días");
  });

  it("por debajo del umbral avisa, por encima no", () => {
    expect(describeValidity(persona({ validTo: enDias(WARN_DAYS - 1) }), AHORA).key).toBe("warn");
    expect(describeValidity(persona({ validTo: enDias(WARN_DAYS + 1) }), AHORA).key).toBe("ok");
  });

  it("2037 no es «vence en 4000 días»: es un alta sin caducidad", () => {
    // Los DS-K1T escriben 2037-12-31 cuando el alta es indefinida. Pintar una
    // cuenta atrás de once años sería mentir en la pantalla.
    const v = describeValidity(persona({ validTo: "2037-12-31T23:59:59Z" }), AHORA);
    expect(v.key).toBe("ok");
    expect(v.indefinite).toBe(true);
    expect(v.label).toBe("Indefinida");
  });

  it("isIndefiniteEnd solo marca los años de fábrica", () => {
    expect(isIndefiniteEnd("2037-12-31T00:00:00Z")).toBe(true);
    expect(isIndefiniteEnd("2036-01-01T00:00:00Z")).toBe(true);
    expect(isIndefiniteEnd("2099-01-01T00:00:00Z")).toBe(true);
    expect(isIndefiniteEnd("2035-12-31T00:00:00Z")).toBe(false);
    expect(isIndefiniteEnd(undefined)).toBe(false);
  });

  it("cada estado trae su explicación, que es lo que se enseña en la ficha", () => {
    for (const p of [
      persona({ validEnable: false }),
      persona(),
      persona({ validTo: enDias(-1) }),
      persona({ validTo: enDias(5) }),
      persona({ validTo: enDias(500) }),
    ]) {
      expect(describeValidity(p, AHORA).meaning.length).toBeGreaterThan(20);
    }
  });
});

describe("Credenciales · qué abre cada una y dónde vive el dato", () => {
  it("el rostro cuenta si lo dice el terminal o si NEXARA guarda el JPEG", () => {
    expect(faceOn(persona({ numOfFace: 1 }))).toBe(true);
    expect(faceOn(persona({ hasFace: true }))).toBe(true);
    expect(faceOn(persona({ hasLocalFace: true }))).toBe(true);
    expect(faceOn(persona({ numOfFace: 0 }))).toBe(false);
  });

  it("distingue «modelo en el terminal» de «JPEG en NEXARA»", () => {
    // No es lo mismo: con modelo pero sin JPEG la persona abre, pero el listado
    // y los eventos salen sin foto. Eso hay que poder leerlo.
    const soloModelo = describeCredentials(persona({ numOfFace: 1 }))[0];
    expect(soloModelo.on).toBe(true);
    expect(soloModelo.detail).toContain("sin JPEG");

    const conJpeg = describeCredentials(persona({ numOfFace: 1, hasLocalFace: true }))[0];
    expect(conJpeg.detail).toContain("NEXARA");
  });

  it("la tarjeta enseña su número cuando el sync lo ha leído", () => {
    const [, , tarjeta] = describeCredentials(persona({ numOfCard: 2, cardNos: ["A1", "B2"] }));
    expect(tarjeta.on).toBe(true);
    expect(tarjeta.detail).toContain("A1");
    expect(tarjeta.detail).toContain("B2");
  });

  it("con tarjeta contada pero sin número lo dice, en vez de fingir que no tiene", () => {
    const [, , tarjeta] = describeCredentials(persona({ numOfCard: 1 }));
    expect(tarjeta.on).toBe(true);
    expect(tarjeta.detail).toContain("aún no ha leído");
  });

  it("credentialScore cuenta tipos activos, de 0 a 3", () => {
    expect(credentialScore(persona())).toBe(0);
    expect(credentialScore(persona({ numOfFace: 1 }))).toBe(1);
    expect(credentialScore(persona({ numOfFace: 1, numOfFP: 2, numOfCard: 1 }))).toBe(3);
  });
});

describe("Ordenación", () => {
  const ada = persona({ id: "1", name: "Ada", validTo: enDias(500) });
  const bruno = persona({ id: "2", name: "bruno", validTo: enDias(500) });
  const cesar = persona({ id: "3", name: "Ángel", validTo: enDias(500) });

  it("por nombre ignora mayúsculas y acentos", () => {
    const orden = sortPeople([bruno, cesar, ada], "nombre").map((p) => p.name);
    expect(orden).toEqual(["Ada", "Ángel", "bruno"]);
  });

  it("nunca muta la lista de origen", () => {
    const original = [bruno, ada];
    const copia = [...original];
    sortPeople(original, "nombre");
    expect(original).toEqual(copia);
  });

  it("por vigencia saca primero lo que hay que atender", () => {
    // Suspendida y caducada arriba: son las dos que ya están dando problemas
    // en la puerta ahora mismo.
    const lista = [
      persona({ id: "ok", name: "Vigente", validTo: enDias(500) }),
      persona({ id: "warn", name: "Pronto", validTo: enDias(5) }),
      persona({ id: "off", name: "Suspendida", validEnable: false }),
      persona({ id: "exp", name: "Caducada", validTo: enDias(-2) }),
      persona({ id: "unk", name: "Sin fecha" }),
    ];
    expect(sortPeople(lista, "vigencia", AHORA).map((p) => p.id)).toEqual([
      "off",
      "exp",
      "warn",
      "unk",
      "ok",
    ]);
  });

  it("dentro del mismo estado, primero lo que se acaba antes", () => {
    const lista = [
      persona({ id: "tarde", name: "B", validTo: enDias(20) }),
      persona({ id: "pronto", name: "A", validTo: enDias(2) }),
    ];
    expect(sortPeople(lista, "vigencia", AHORA).map((p) => p.id)).toEqual(["pronto", "tarde"]);
  });

  it("por credenciales saca primero las fichas incompletas", () => {
    const lista = [
      persona({ id: "todo", name: "C", numOfFace: 1, numOfFP: 1, numOfCard: 1 }),
      persona({ id: "nada", name: "A" }),
      persona({ id: "media", name: "B", numOfFace: 1 }),
    ];
    expect(sortPeople(lista, "credenciales").map((p) => p.id)).toEqual(["nada", "media", "todo"]);
  });
});

describe("Filtros", () => {
  const conRostro = persona({
    id: "1",
    name: "Ada Lovelace",
    code: "NXR001",
    userType: "normal",
    doorNames: ["Puerta principal", "Almacén"],
    numOfFace: 1,
    validTo: enDias(500),
  });
  const sinRostro = persona({
    id: "2",
    name: "Grace Hopper",
    code: "NXR002",
    userType: "visitor",
    doorNames: ["Puerta principal"],
    validTo: enDias(-1),
  });
  const suspendida = persona({
    id: "3",
    name: "Alan Turing",
    code: "NXR003",
    userType: "blackList",
    validEnable: false,
    orgId: "org-2",
  });
  const todas = [conRostro, sinRostro, suspendida];
  const sinErp = () => null;

  function filtros(patch: Partial<PeopleFilters> = {}): PeopleFilters {
    return { ...EMPTY_FILTERS, ...patch };
  }

  it("sin filtros no descarta a nadie", () => {
    expect(filterPeople(todas, filtros(), sinErp, AHORA)).toHaveLength(3);
  });

  it("por estado de vigencia", () => {
    expect(filterPeople(todas, filtros({ estado: "off" }), sinErp, AHORA)).toEqual([suspendida]);
    expect(filterPeople(todas, filtros({ estado: "expired" }), sinErp, AHORA)).toEqual([sinRostro]);
    expect(filterPeople(todas, filtros({ estado: "ok" }), sinErp, AHORA)).toEqual([conRostro]);
  });

  it("con y sin rostro son dos preguntas distintas, no un solo desplegable", () => {
    expect(filterPeople(todas, filtros({ rostro: "si" }), sinErp, AHORA)).toEqual([conRostro]);
    expect(filterPeople(todas, filtros({ rostro: "no" }), sinErp, AHORA)).toEqual([
      sinRostro,
      suspendida,
    ]);
  });

  it("por tipo de usuario, sin que importen las mayúsculas del terminal", () => {
    // El equipo devuelve `blackList`; el catálogo lo documenta `blacklist`.
    expect(filterPeople(todas, filtros({ tipo: "blacklist" }), sinErp, AHORA)).toEqual([suspendida]);
    expect(filterPeople(todas, filtros({ tipo: "visitor" }), sinErp, AHORA)).toEqual([sinRostro]);
  });

  it("por puerta que puede abrir", () => {
    expect(filterPeople(todas, filtros({ puerta: "Almacén" }), sinErp, AHORA)).toEqual([conRostro]);
    expect(filterPeople(todas, filtros({ puerta: "Puerta principal" }), sinErp, AHORA)).toEqual([
      conRostro,
      sinRostro,
    ]);
  });

  it("los filtros se combinan: son condiciones a la vez, no alternativas", () => {
    const r = filterPeople(
      todas,
      filtros({ puerta: "Puerta principal", rostro: "no" }),
      sinErp,
      AHORA,
    );
    expect(r).toEqual([sinRostro]);
  });

  it("la búsqueda entra por nombre, código e id", () => {
    expect(filterPeople(todas, filtros({ q: "grace" }), sinErp, AHORA)).toEqual([sinRostro]);
    expect(filterPeople(todas, filtros({ q: "nxr003" }), sinErp, AHORA)).toEqual([suspendida]);
  });

  it("la búsqueda también encuentra por los datos del ERP", () => {
    // Quien busca «contabilidad» no está buscando un código de terminal.
    const erpDe = (p: Person) =>
      p.id === "1"
        ? { nombre: "Ada L.", email: "ada@empresa.com", role: { nombre: "Contabilidad" } }
        : null;
    expect(filterPeople(todas, filtros({ q: "contabilidad" }), erpDe, AHORA)).toEqual([conRostro]);
    expect(filterPeople(todas, filtros({ q: "ada@empresa" }), erpDe, AHORA)).toEqual([conRostro]);
  });

  it("por estar o no vinculada al ERP", () => {
    const erpDe = (p: Person) => (p.id === "1" ? { nombre: "Ada L." } : null);
    expect(filterPeople(todas, filtros({ erp: "si" }), erpDe, AHORA)).toEqual([conRostro]);
    expect(filterPeople(todas, filtros({ erp: "no" }), erpDe, AHORA)).toEqual([
      sinRostro,
      suspendida,
    ]);
  });

  it("por organización", () => {
    expect(filterPeople(todas, filtros({ org: "org-2" }), sinErp, AHORA)).toEqual([suspendida]);
  });

  it("personMatches es la unidad y responde igual que la lista", () => {
    expect(personMatches(conRostro, filtros({ rostro: "si" }), null, AHORA)).toBe(true);
    expect(personMatches(sinRostro, filtros({ rostro: "si" }), null, AHORA)).toBe(false);
  });
});

describe("Opciones que ofrece el filtro", () => {
  it("solo lista los tipos que existen de verdad en el directorio, ya traducidos", () => {
    const opciones = userTypeOptions([
      persona({ id: "1", userType: "normal" }),
      persona({ id: "2", userType: "Normal" }),
      persona({ id: "3", userType: "visitor" }),
      persona({ id: "4" }),
    ]);
    expect(opciones.map((o) => o.value).sort()).toEqual(["normal", "visitor"]);
    expect(opciones.find((o) => o.value === "visitor")?.label).toBe("Visitante");
  });

  it("las puertas salen sin repetir y ordenadas", () => {
    expect(
      doorOptions([
        persona({ id: "1", doorNames: ["Zaguán", "Almacén"] }),
        persona({ id: "2", doorNames: ["Almacén"] }),
        persona({ id: "3" }),
      ]),
    ).toEqual(["Almacén", "Zaguán"]);
  });

  it("una puerta con nombre vacío no llega al desplegable", () => {
    expect(personDoors(persona({ doorNames: ["", "  ", "Recepción"] }))).toEqual(["Recepción"]);
  });

  it("el tipo sin traducción conocida se enseña tal cual, no como «Sin tipo»", () => {
    expect(userTypeLabel("patrol")).toBe("Ronda");
    expect(userTypeLabel("customType")).toBe("customType");
    expect(userTypeLabel(undefined)).toBe("Sin tipo");
  });
});

describe("Detalle legible · el volcado de JSON deja de ser el contenido", () => {
  it("traduce las claves de ISAPI a algo que se pueda leer", () => {
    const facts = flattenDetail({ employeeNo: "NXR001", numOfFP: 2, templateName: "Oficina" });
    const porRuta = new Map(facts.map((f) => [f.path, f]));
    expect(porRuta.get("employeeNo")?.label).toBe("Nº de empleado");
    expect(porRuta.get("numOfFP")?.label).toBe("Huellas enroladas");
    expect(porRuta.get("templateName")?.label).toBe("Plan horario");
  });

  it("los booleanos se leen Sí/No, no true/false", () => {
    const [fact] = flattenDetail({ validEnable: false });
    expect(fact.value).toBe("No");
  });

  it("aplana lo anidado con la ruta completa", () => {
    const facts = flattenDetail({ Valid: { enable: true, beginTime: "2020-01-01" } });
    expect(facts.map((f) => f.path)).toContain("Valid.enable");
  });

  it("una lista larga se resume en vez de reventar la ficha", () => {
    const [fact] = flattenDetail({ cardNos: Array.from({ length: 12 }, (_, i) => `C${i}`) });
    expect(fact.value).toContain("+4 más");
  });

  it("no baja indefinidamente: hay tope de profundidad", () => {
    const hondo = { a: { b: { c: { d: { e: "fondo" } } } } };
    expect(flattenDetail(hondo).some((f) => f.value === "fondo")).toBe(false);
  });

  it("una clave sin traducción se humaniza en vez de salir en camelCase", () => {
    const [fact] = flattenDetail({ someUnknownKey: "x" });
    expect(fact.label).toBe("Some Unknown Key");
  });
});

describe("Errores · «no tienes permiso» no es «el servidor no responde»", () => {
  it("un 403 no ofrece reintentar, porque reintentar no lo arregla", () => {
    const info = describeError("Request failed with status code 403");
    expect(info.kind).toBe("permiso");
    expect(info.retriable).toBe(false);
  });

  it("un fallo de red sí ofrece reintentar", () => {
    const info = describeError("TypeError: Failed to fetch");
    expect(info.kind).toBe("red");
    expect(info.retriable).toBe(true);
    expect(info.tone).toBe("danger");
  });

  it("un código repetido se explica como lo que es", () => {
    expect(describeError("El empleado ya existe (409)").kind).toBe("conflicto");
  });

  it("lo que no encaja en ningún patrón sigue dando una salida útil", () => {
    const info = describeError("algo raro pasó");
    expect(info.title.length).toBeGreaterThan(0);
    expect(info.hint.length).toBeGreaterThan(0);
  });
});
