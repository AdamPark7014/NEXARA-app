import { describe, expect, it } from "vitest";

import {
  FILTROS_VEHICULOS_INICIALES,
  PLACA_MAX,
  claveDePlaca,
  contarSinDueno,
  esFiltroDueno,
  etiquetaPersona,
  filtrarVehiculos,
  hayFiltroVehiculos,
  normalizarPlaca,
  placaDuplicada,
  resolverDueno,
  tieneDueno,
  validarPlaca,
  type FiltrosVehiculos,
  type PersonaResumen,
  type Vehiculo,
} from "./_placas";

/**
 * Por qué existen estas pruebas.
 *
 * El alta de vehículos del servidor es un `upsert` sobre la placa despojada de
 * todo lo que no sea letra o número. Es decir: guardar «ABC-123» cuando ya
 * existe «ABC 123» no da error, **pisa la ficha anterior en silencio**. Toda la
 * validación de esta pantalla existe para que eso no llegue a pasar, así que si
 * se rompe no se rompe con un error: se rompe perdiendo datos.
 */

const v = (p: Partial<Vehiculo> & { id: string }): Vehiculo => ({
  plate: "ABC1234",
  ...p,
});

const filtros = (p: Partial<FiltrosVehiculos> = {}): FiltrosVehiculos => ({
  ...FILTROS_VEHICULOS_INICIALES,
  ...p,
});

describe("normalización · lo mismo que hace el servidor antes de guardar", () => {
  it("recorta, colapsa espacios y sube a mayúsculas", () => {
    expect(normalizarPlaca("  abc 123  ")).toBe("ABC 123");
    expect(normalizarPlaca("abc   123")).toBe("ABC 123");
    expect(normalizarPlaca("")).toBe("");
  });

  it("la clave del servidor se queda solo con letras y números", () => {
    // apps/api → addVehicle: `local-${plate.replace(/[^A-Z0-9]/gi, '')}`
    expect(claveDePlaca("ABC-123")).toBe("ABC123");
    expect(claveDePlaca("abc 123")).toBe("ABC123");
    expect(claveDePlaca("A-B-C 1 2 3")).toBe("ABC123");
    expect(claveDePlaca("---")).toBe("");
  });
});

describe("validación de placa · bloquear solo lo que de verdad se rompe", () => {
  it("una placa vacía no se manda", () => {
    expect(validarPlaca("   ").valida).toBe(false);
    expect(validarPlaca("").error).toBe("Escribe una placa.");
  });

  it("rechaza pasarse del ancho de la columna", () => {
    const larga = "A".repeat(PLACA_MAX + 1);
    const r = validarPlaca(larga);
    expect(r.valida).toBe(false);
    expect(r.error).toContain(String(PLACA_MAX));
    // Justo en el límite sí entra.
    expect(validarPlaca("A".repeat(PLACA_MAX)).valida).toBe(true);
  });

  it("rechaza caracteres que no son de una placa", () => {
    expect(validarPlaca("ABC*123").valida).toBe(false);
    expect(validarPlaca("ABC/123").error).toContain("letras, números, espacios y guiones");
    expect(validarPlaca("ABC-123").valida).toBe(true);
    expect(validarPlaca("ABC 123").valida).toBe(true);
  });

  it("rechaza una placa sin ningún alfanumérico: todas colisionarían en `local-`", () => {
    const r = validarPlaca("---");
    expect(r.valida).toBe(false);
    expect(r.error).toContain("identificador");
  });

  it("una placa corta avisa pero NO bloquea: el servidor la acepta", () => {
    const r = validarPlaca("AB1");
    expect(r.valida).toBe(true);
    expect(r.error).toBeNull();
    expect(r.aviso).toContain("3 caracteres útiles");
  });

  it("una placa normal no avisa de nada", () => {
    const r = validarPlaca("abc-1234");
    expect(r.valida).toBe(true);
    expect(r.aviso).toBeNull();
    expect(r.normalizada).toBe("ABC-1234");
  });
});

describe("duplicados · el upsert que pisa fichas", () => {
  const inventario = [v({ id: "local-ABC123", plate: "ABC-123" }), v({ id: "x", plate: "XYZ999" })];

  it("detecta la misma placa aunque se escriba distinto", () => {
    expect(placaDuplicada("abc 123", inventario)?.id).toBe("local-ABC123");
    expect(placaDuplicada("ABC123", inventario)?.id).toBe("local-ABC123");
  });

  it("una placa nueva no es duplicado", () => {
    expect(placaDuplicada("QQQ111", inventario)).toBeNull();
  });

  it("editando una ficha, ella misma no cuenta como duplicado", () => {
    expect(placaDuplicada("ABC-123", inventario, "local-ABC123")).toBeNull();
    // Pero sí choca con OTRA ficha existente.
    expect(placaDuplicada("XYZ-999", inventario, "local-ABC123")?.id).toBe("x");
  });

  it("una placa sin alfanuméricos no colisiona con nada por accidente", () => {
    expect(placaDuplicada("---", inventario)).toBeNull();
  });
});

describe("filtros del inventario", () => {
  const inventario = [
    v({ id: "1", plate: "ABC-123", personId: "1001", personName: "Ada Lovelace" }),
    v({ id: "2", plate: "XYZ999" }),
    v({ id: "3", plate: "JKL-456", personId: "1002", personName: "Grace Hopper" }),
  ];

  it("sin filtros devuelve todo", () => {
    expect(filtrarVehiculos(inventario, filtros())).toHaveLength(3);
  });

  it("busca una placa aunque el guion no coincida", () => {
    // Escribir «ABC123» tiene que encontrar «ABC-123».
    expect(filtrarVehiculos(inventario, filtros({ q: "ABC123" })).map((x) => x.id)).toEqual(["1"]);
    expect(filtrarVehiculos(inventario, filtros({ q: "abc-1" })).map((x) => x.id)).toEqual(["1"]);
  });

  it("busca por persona, sin distinguir mayúsculas", () => {
    expect(filtrarVehiculos(inventario, filtros({ q: "hopper" })).map((x) => x.id)).toEqual(["3"]);
    expect(filtrarVehiculos(inventario, filtros({ q: "1001" })).map((x) => x.id)).toEqual(["1"]);
  });

  it("separa las que tienen dueño de las que no", () => {
    expect(filtrarVehiculos(inventario, filtros({ dueno: "sin" })).map((x) => x.id)).toEqual(["2"]);
    expect(filtrarVehiculos(inventario, filtros({ dueno: "con" })).map((x) => x.id)).toEqual([
      "1",
      "3",
    ]);
  });

  it("combina búsqueda y dueño", () => {
    expect(filtrarVehiculos(inventario, filtros({ q: "9", dueno: "con" }))).toEqual([]);
  });

  it("un filtro de solo espacios no cuenta como filtro", () => {
    expect(hayFiltroVehiculos(filtros())).toBe(false);
    expect(hayFiltroVehiculos(filtros({ q: "  " }))).toBe(false);
    expect(hayFiltroVehiculos(filtros({ dueno: "sin" }))).toBe(true);
  });

  it("solo acepta valores conocidos de dueño (la URL puede traer basura)", () => {
    expect(esFiltroDueno("")).toBe(true);
    expect(esFiltroDueno("con")).toBe(true);
    expect(esFiltroDueno("sin")).toBe(true);
    expect(esFiltroDueno("cualquiera")).toBe(false);
  });

  it("cuenta las placas sin dueño", () => {
    expect(contarSinDueno(inventario)).toBe(1);
    expect(tieneDueno(inventario[1])).toBe(false);
  });
});

describe("dueño · el nombre guardado es una foto, no un vínculo vivo", () => {
  const padron: PersonaResumen[] = [
    { id: "1001", name: "Ada Lovelace", code: "E-01", orgName: "Ingeniería" },
    { id: "1002", name: "Grace Hopper" },
  ];

  it("resuelve contra el padrón cuando la persona sigue existiendo", () => {
    const d = resolverDueno(v({ id: "1", personId: "1001", personName: "Ada L." }), padron);
    expect(d.estado).toBe("conocido");
    // Gana el nombre vivo del padrón, no la foto guardada en el vehículo.
    if (d.estado === "conocido") expect(d.nombre).toBe("Ada Lovelace");
  });

  it("marca como ausente a quien ya no está en el padrón", () => {
    const d = resolverDueno(v({ id: "1", personId: "9999", personName: "Fulanito" }), padron);
    expect(d.estado).toBe("ausente");
    if (d.estado === "ausente") {
      expect(d.id).toBe("9999");
      expect(d.nombre).toBe("Fulanito");
    }
  });

  it("sin personId ni nombre, es sencillamente sin dueño", () => {
    expect(resolverDueno(v({ id: "1" }), padron).estado).toBe("sin-dueno");
    expect(resolverDueno(v({ id: "1", personId: "  " }), padron).estado).toBe("sin-dueno");
  });

  it("un nombre suelto sin id no se pierde: se enseña como ausente", () => {
    const d = resolverDueno(v({ id: "1", personName: "Alguien de la plataforma" }), padron);
    expect(d.estado).toBe("ausente");
    if (d.estado === "ausente") expect(d.nombre).toBe("Alguien de la plataforma");
  });

  it("desambigua a dos personas que se llaman igual", () => {
    expect(etiquetaPersona(padron[0])).toBe("Ada Lovelace (E-01 · Ingeniería)");
    expect(etiquetaPersona(padron[1])).toBe("Grace Hopper");
  });
});
