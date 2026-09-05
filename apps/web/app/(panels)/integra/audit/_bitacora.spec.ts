import { describe, expect, it } from "vitest";

import {
  CABECERAS_CSV,
  FILTROS_INICIALES,
  TOPE_SERVIDOR,
  aCsv,
  accionesPresentes,
  avisoDeVentana,
  categoriaAccion,
  describirActor,
  describirCambios,
  esAccionCritica,
  etiquetaAccion,
  filtrarEntradas,
  formatearFecha,
  haceCuanto,
  hayFiltroActivo,
  nombreArchivoCsv,
  paginar,
  rangoDePreset,
  resumenDeCambios,
  textoBuscable,
  type EntradaBitacora,
  type FiltrosBitacora,
} from "./_bitacora";

/**
 * Por qué existen estas pruebas.
 *
 * La bitácora es el único registro de quién abrió una puerta a distancia. Lo
 * que se rompe aquí no se ve: un filtro de fechas que se come una fila, un
 * detalle que se corta, una paginación que enseña 40 de 200 sin decirlo. Nadie
 * lo nota hasta que hay que reconstruir un incidente, y entonces ya da igual.
 */

const entrada = (p: Partial<EntradaBitacora> & { id: number }): EntradaBitacora => ({
  action: "integra.vehicle.add",
  createdAt: "2026-09-03T10:00:00.000Z",
  entityId: 7,
  ...p,
});

const filtros = (p: Partial<FiltrosBitacora> = {}): FiltrosBitacora => ({
  ...FILTROS_INICIALES,
  ...p,
});

describe("catálogo de acciones · lo que el backend escribe de verdad", () => {
  it("traduce las acciones catalogadas y deja crudas las que no conoce", () => {
    expect(etiquetaAccion("integra.door.open")).toBe("Puerta abierta a distancia");
    // Una acción nueva del backend no se esconde: se enseña su código.
    expect(etiquetaAccion("integra.futuro.inventado")).toBe("integra.futuro.inventado");
  });

  it("deduce la categoría de una acción no catalogada por su familia", () => {
    expect(categoriaAccion("integra.door.control")).toBe("puertas");
    expect(categoriaAccion("integra.door.loquesea")).toBe("puertas");
    expect(categoriaAccion("integra.ptz.preset")).toBe("camaras");
    expect(categoriaAccion("integra.cosarara.x")).toBe("otro");
    expect(categoriaAccion("otracosa")).toBe("otro");
  });

  it("marca como crítico lo que cambia quién entra dónde, y solo eso", () => {
    expect(esAccionCritica("integra.door.open")).toBe(true);
    expect(esAccionCritica("integra.door.control")).toBe(true);
    expect(esAccionCritica("integra.schedule.weekPlan.put")).toBe(true);
    expect(esAccionCritica("integra.privilege.assign")).toBe(true);
    expect(esAccionCritica("integra.person.access.patch")).toBe(true);
    // Cambiar una placa no abre ninguna puerta.
    expect(esAccionCritica("integra.vehicle.update")).toBe(false);
    expect(esAccionCritica("integra.ptz.preset")).toBe(false);
  });

  it("solo ofrece en el desplegable las acciones presentes, con su cuenta", () => {
    const items = [
      entrada({ id: 1, action: "integra.door.open" }),
      entrada({ id: 2, action: "integra.door.open" }),
      entrada({ id: 3, action: "integra.vehicle.add" }),
    ];
    expect(accionesPresentes(items)).toEqual([
      { valor: "integra.vehicle.add", etiqueta: "Alta de vehículo", cuantas: 1 },
      { valor: "integra.door.open", etiqueta: "Puerta abierta a distancia", cuantas: 2 },
    ]);
  });
});

describe("actor · una fila sin usuario no es una fila sin dato", () => {
  it("junta nombre y correo cuando están los dos", () => {
    expect(
      describirActor(entrada({ id: 1, userName: "Ada", userEmail: "ada@nexara.mx" })),
    ).toBe("Ada · ada@nexara.mx");
  });

  it("se queda con lo que haya si falta uno", () => {
    expect(describirActor(entrada({ id: 1, userName: "Ada" }))).toBe("Ada");
    expect(describirActor(entrada({ id: 1, userEmail: "ada@nexara.mx" }))).toBe("ada@nexara.mx");
  });

  it("dice que fue un proceso automático en vez de pintar un guion", () => {
    // `audit_logs.userId` es opcional: sin sesión, la fila llega sin usuario.
    expect(describirActor(entrada({ id: 1 }))).toBe("Proceso automático (sin usuario)");
    expect(describirActor(entrada({ id: 1, userName: "  ", userEmail: null }))).toBe(
      "Proceso automático (sin usuario)",
    );
  });
});

describe("filtros · el filtro que se come una fila es el peor error posible", () => {
  const items = [
    entrada({ id: 1, action: "integra.door.open", createdAt: "2026-09-01T08:00:00.000Z" }),
    entrada({ id: 2, action: "integra.vehicle.add", createdAt: "2026-09-02T08:00:00.000Z" }),
    entrada({
      id: 3,
      action: "integra.schedule.weekPlan.put",
      createdAt: "2026-09-03T08:00:00.000Z",
      userName: "Ada Lovelace",
      userEmail: "ada@nexara.mx",
    }),
  ];

  it("sin filtros devuelve todo, lo más reciente primero", () => {
    expect(filtrarEntradas(items, filtros()).map((e) => e.id)).toEqual([3, 2, 1]);
  });

  it("el orden cronológico invierte, que es como se reconstruye un incidente", () => {
    expect(filtrarEntradas(items, filtros({ orden: "asc" })).map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("acota por fecha y hora local, con los dos extremos incluidos", () => {
    const desde = new Date("2026-09-02T00:00:00.000Z");
    const hasta = new Date("2026-09-02T23:59:00.000Z");
    const aLocal = (d: Date) => {
      const p = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    const soloDia2 = filtrarEntradas(
      items,
      filtros({ desde: aLocal(desde), hasta: aLocal(hasta) }),
    );
    expect(soloDia2.map((e) => e.id)).toEqual([2]);
  });

  it("una entrada con fecha ilegible NO la esconde el filtro de fechas", () => {
    // Es justo la fila que más raro huele: no puede desaparecer sin más.
    const conBasura = [...items, entrada({ id: 9, createdAt: "no-es-una-fecha" })];
    const salida = filtrarEntradas(conBasura, filtros({ desde: "2026-09-03T00:00" }));
    expect(salida.map((e) => e.id)).toContain(9);
  });

  it("filtra por acción exacta y por área", () => {
    expect(filtrarEntradas(items, filtros({ accion: "integra.door.open" })).map((e) => e.id)).toEqual([1]);
    expect(filtrarEntradas(items, filtros({ categoria: "horarios" })).map((e) => e.id)).toEqual([3]);
  });

  it("busca al actor por nombre o por correo, sin distinguir mayúsculas", () => {
    expect(filtrarEntradas(items, filtros({ actor: "LOVELACE" })).map((e) => e.id)).toEqual([3]);
    expect(filtrarEntradas(items, filtros({ actor: "@nexara" })).map((e) => e.id)).toEqual([3]);
    expect(filtrarEntradas(items, filtros({ actor: "nadie" }))).toEqual([]);
  });

  it("la búsqueda libre entra dentro de `changes`", () => {
    const conDetalle = [
      entrada({
        id: 5,
        action: "integra.door.open",
        changes: { doorIndexCode: "192.168.9.31|1", reason: "Proveedor de limpieza" },
      }),
      entrada({ id: 6 }),
    ];
    expect(filtrarEntradas(conDetalle, filtros({ q: "limpieza" })).map((e) => e.id)).toEqual([5]);
    expect(filtrarEntradas(conDetalle, filtros({ q: "9.31" })).map((e) => e.id)).toEqual([5]);
  });

  it("desempata por id cuando dos entradas comparten milisegundo", () => {
    const gemelas = [
      entrada({ id: 10, createdAt: "2026-09-04T12:00:00.000Z" }),
      entrada({ id: 11, createdAt: "2026-09-04T12:00:00.000Z" }),
    ];
    expect(filtrarEntradas(gemelas, filtros()).map((e) => e.id)).toEqual([11, 10]);
    expect(filtrarEntradas(gemelas, filtros({ orden: "asc" })).map((e) => e.id)).toEqual([10, 11]);
  });

  it("no considera activo un filtro que es solo espacios", () => {
    expect(hayFiltroActivo(filtros())).toBe(false);
    expect(hayFiltroActivo(filtros({ q: "   " }))).toBe(false);
    expect(hayFiltroActivo(filtros({ orden: "asc" }))).toBe(false);
    expect(hayFiltroActivo(filtros({ accion: "integra.door.open" }))).toBe(true);
    expect(hayFiltroActivo(filtros({ desde: "2026-09-01T00:00" }))).toBe(true);
  });

  it("no muta el array que recibe", () => {
    const original = [...items];
    filtrarEntradas(items, filtros({ orden: "asc" }));
    expect(items).toEqual(original);
  });

  it("textoBuscable aguanta un `changes` con ciclos sin reventar", () => {
    const ciclo: Record<string, unknown> = { a: 1 };
    ciclo.yo = ciclo;
    expect(() => textoBuscable(entrada({ id: 1, changes: ciclo }))).not.toThrow();
  });
});

describe("paginación · nunca dejar al usuario en una página que no existe", () => {
  const items = Array.from({ length: 55 }, (_, i) => entrada({ id: i + 1 }));

  it("cuenta el rango visible en base 1 e inclusivo", () => {
    const p = paginar(items, 1, 25);
    expect(p.visibles).toHaveLength(25);
    expect(p.primero).toBe(1);
    expect(p.ultimo).toBe(25);
    expect(p.paginas).toBe(3);
    expect(p.total).toBe(55);
  });

  it("la última página se queda corta y lo refleja", () => {
    const p = paginar(items, 3, 25);
    expect(p.visibles).toHaveLength(5);
    expect(p.primero).toBe(51);
    expect(p.ultimo).toBe(55);
  });

  it("recorta una página fuera de rango en vez de enseñar el vacío", () => {
    expect(paginar(items, 99, 25).pagina).toBe(3);
    expect(paginar(items, 0, 25).pagina).toBe(1);
    expect(paginar(items, Number.NaN, 25).pagina).toBe(1);
  });

  it("sin resultados hay una página y el rango es 0–0", () => {
    const p = paginar([], 1, 25);
    expect(p.paginas).toBe(1);
    expect(p.primero).toBe(0);
    expect(p.ultimo).toBe(0);
    expect(p.total).toBe(0);
  });

  it("un tamaño imposible no divide entre cero", () => {
    expect(paginar(items, 1, 0).visibles).toHaveLength(1);
  });
});

describe("el tope del servidor se dice, no se disimula", () => {
  it("solo avisa cuando la respuesta llegó topada", () => {
    expect(avisoDeVentana(0)).toBeNull();
    expect(avisoDeVentana(199)).toBeNull();
    const aviso = avisoDeVentana(TOPE_SERVIDOR);
    expect(aviso).toContain("200");
    expect(aviso).toContain("más antigua");
  });

  it("el tope es el que recorta `listAudit` en la API", () => {
    // apps/api → integra-artemis.service.ts: Math.min(Math.max(limit ?? 40, 1), 200)
    expect(TOPE_SERVIDOR).toBe(200);
  });
});

describe("rangos rápidos", () => {
  const ahora = new Date("2026-09-05T15:30:00.000Z");

  it("«todo» limpia las dos fechas", () => {
    expect(rangoDePreset("todo", ahora)).toEqual({ desde: "", hasta: "" });
  });

  it("fija un `desde` absoluto y deja `hasta` abierto", () => {
    const r = rangoDePreset("24h", ahora);
    expect(r.hasta).toBe("");
    // 24 h antes del instante dado, en hora local y con forma datetime-local.
    expect(r.desde).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const delta = ahora.getTime() - new Date(r.desde).getTime();
    expect(delta).toBeGreaterThanOrEqual(23.9 * 3_600_000);
    expect(delta).toBeLessThanOrEqual(24.1 * 3_600_000);
  });

  it("7 días son 7 días", () => {
    const delta = ahora.getTime() - new Date(rangoDePreset("7d", ahora).desde).getTime();
    expect(Math.round(delta / 86_400_000)).toBe(7);
  });
});

describe("detalle · se acabó el JSON cortado a la mitad", () => {
  it("desmonta el objeto en campos con etiqueta en español", () => {
    const d = describirCambios({
      doorIndexCode: "192.168.9.31|1",
      controlType: "2",
      reason: "Visita",
      provider: "ISAPI",
    });
    expect(d.vacio).toBe(false);
    const porClave = Object.fromEntries(d.campos.map((c) => [c.clave, c]));
    expect(porClave.doorIndexCode.etiqueta).toBe("Puerta");
    expect(porClave.reason.etiqueta).toBe("Motivo");
    // El código de control se decodifica con la tabla real de `_lib`.
    expect(porClave.controlType.valor).toBe("Abrir (momentáneo) (2)");
    expect(porClave.doorIndexCode.destacado).toBe(true);
    expect(porClave.provider.destacado).toBe(false);
  });

  it("el JSON íntegro va entero, sin recorte", () => {
    const grande = { reason: "x".repeat(400) };
    const d = describirCambios(grande);
    expect(d.json).not.toBeNull();
    expect(d.json).toContain("x".repeat(400));
    expect(JSON.parse(d.json as string)).toEqual(grande);
  });

  it("distingue «sin detalle» de «detalle vacío»", () => {
    expect(describirCambios(null)).toEqual({ campos: [], json: null, vacio: true });
    expect(describirCambios(undefined).json).toBeNull();
    // `integra.privilege.apply` escribe exactamente `{}`.
    const vacio = describirCambios({});
    expect(vacio.vacio).toBe(true);
    expect(vacio.json).toBe("{}");
  });

  it("traduce booleanos y listas a algo que se lee", () => {
    const d = describirCambios({
      deviceSync: false,
      personIds: ["1001", "1002"],
      nada: null,
      texto: "",
    });
    const porClave = Object.fromEntries(d.campos.map((c) => [c.clave, c.valor]));
    expect(porClave.deviceSync).toBe("no");
    expect(porClave.personIds).toBe("1001, 1002");
    expect(porClave.nada).toBe("—");
    expect(porClave.texto).toBe("(vacío)");
  });

  it("un `changes` que no es objeto también se enseña", () => {
    expect(describirCambios("solo texto").campos[0].valor).toBe("solo texto");
    expect(describirCambios(42).campos[0].valor).toBe("42");
  });

  it("el resumen de la celda no corta un campo por la mitad: dice cuántos faltan", () => {
    const resumen = resumenDeCambios({
      doorIndexCode: "192.168.9.31|1",
      controlType: "2",
      provider: "ISAPI",
      cmd: "open",
      email: "ada@nexara.mx",
    });
    // Primero los que cuentan la historia.
    expect(resumen).toContain("Puerta: 192.168.9.31|1");
    expect(resumen).toContain("Tipo de control: Abrir (momentáneo) (2)");
    // Y lo que no cabe se cuenta, no se trunca.
    expect(resumen).toContain("+3 campos");
    expect(resumen).not.toContain("…");
  });

  it("el resumen de una entrada sin detalle es cadena vacía", () => {
    expect(resumenDeCambios(null)).toBe("");
    expect(resumenDeCambios({})).toBe("");
  });

  it("singular y plural del contador de campos restantes", () => {
    expect(resumenDeCambios({ a: 1, b: 2, c: 3 })).toContain("+1 campo");
    expect(resumenDeCambios({ a: 1, b: 2, c: 3 })).not.toContain("+1 campos");
  });
});

describe("fechas", () => {
  it("una fecha ilegible se dice con esas palabras", () => {
    expect(formatearFecha("no-es-fecha")).toBe("Fecha ilegible");
  });

  it("formatea en hora local de 24 h", () => {
    const salida = formatearFecha("2026-09-05T15:30:00.000Z");
    expect(salida).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(salida).not.toMatch(/a\.?\s?m\.?|p\.?\s?m\.?/i);
  });

  it("dice la antigüedad en cristiano", () => {
    const ahora = new Date("2026-09-05T12:00:00.000Z");
    expect(haceCuanto("2026-09-05T11:59:40.000Z", ahora)).toBe("hace instantes");
    expect(haceCuanto("2026-09-05T11:30:00.000Z", ahora)).toBe("hace 30 min");
    expect(haceCuanto("2026-09-05T09:00:00.000Z", ahora)).toBe("hace 3 h");
    expect(haceCuanto("2026-09-04T12:00:00.000Z", ahora)).toBe("hace 1 día");
    expect(haceCuanto("2026-09-01T12:00:00.000Z", ahora)).toBe("hace 4 días");
    // Más de un mes: la fecha absoluta ya lo dice todo.
    expect(haceCuanto("2026-01-01T12:00:00.000Z", ahora)).toBe("");
    expect(haceCuanto("basura", ahora)).toBe("");
  });

  it("marca una fecha futura en vez de disimularla", () => {
    const ahora = new Date("2026-09-05T12:00:00.000Z");
    expect(haceCuanto("2026-09-06T12:00:00.000Z", ahora)).toBe("fecha futura");
  });
});

describe("CSV · lo que se adjunta a un informe", () => {
  const items = [
    entrada({
      id: 1,
      action: "integra.door.open",
      createdAt: "2026-09-05T12:00:00.000Z",
      userName: 'Ada "La" Lovelace',
      userEmail: "ada@nexara.mx",
      entityId: 7,
      changes: { reason: "con, coma" },
    }),
  ];

  it("lleva BOM para que Excel en español no parta los acentos", () => {
    expect(aCsv(items).charCodeAt(0)).toBe(0xfeff);
  });

  it("escapa comillas y comas sin romper la columna", () => {
    const csv = aCsv(items);
    expect(csv).toContain('"Ada ""La"" Lovelace"');
    expect(csv).toContain('"{""reason"":""con, coma""}"');
  });

  it("lleva la cabecera completa y una línea por entrada", () => {
    const lineas = aCsv(items).split("\r\n");
    // El BOM va pegado a la cabecera: se quita para comparar los nombres.
    expect(lineas[0].replace(/^﻿/, "")).toBe(CABECERAS_CSV.join(","));
    expect(lineas).toHaveLength(2);
    expect(lineas[1]).toContain('"Puerta abierta a distancia"');
    expect(lineas[1]).toContain('"Puertas"');
    // La columna «crítica» es la que se mira primero en una revisión.
    expect(lineas[1]).toContain('"sí"');
  });

  it("sin entradas sale solo la cabecera, no un archivo roto", () => {
    expect(aCsv([]).split("\r\n")).toHaveLength(1);
  });

  it("el nombre del archivo lleva fecha y hora, para no pisar el anterior", () => {
    expect(nombreArchivoCsv(new Date(2026, 8, 5, 14, 3))).toBe(
      "bitacora-integra-20260905-1403.csv",
    );
  });
});
