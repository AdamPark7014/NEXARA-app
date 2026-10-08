import { describe, expect, it } from "vitest";
import {
  FILTROS_BUSQUEDA,
  FORM_ARTICULO_VACIO,
  TIPOS_ARTICULO,
  empaqueDeProducto,
  esTipoBusqueda,
  etiquetaTipoArticulo,
  existenciaCorta,
  filtrosVisibles,
  formArticuloDeProducto,
  normalizarTipoArticulo,
  previaEmpaque,
  textoExistencia,
  tonoTipoArticulo,
  unidadDeArticulo,
  validarArticulo,
} from "./tipos-articulo";

const BOTE = { nombre: "Bote", piezasPorUnidad: 100 };
const BOBINA = { nombre: "Bobina", piezasPorUnidad: "305.0000" };

describe("tipos de artículo", () => {
  it("son cuatro, en el orden aprobado", () => {
    expect(TIPOS_ARTICULO.map((t) => t.etiqueta)).toEqual(["Herramienta", "Equipo", "Consumible", "Por medida"]);
  });

  it("la herramienta no es producto del catálogo y el equipo no lleva empaque", () => {
    const [herramienta, equipo, consumible, medida] = TIPOS_ARTICULO;
    expect(herramienta.esProducto).toBe(false);
    expect(equipo.empaque).toBeNull();
    expect(consumible.empaque?.campo).toBe("Empaque");
    expect(medida.empaque?.campo).toBe("Presentación");
    expect(medida.unidad).toBe("m");
  });

  it("normaliza lo que manda la API y deja «Sin tipo» a los viejos", () => {
    expect(normalizarTipoArticulo(" consumible ")).toBe("CONSUMIBLE");
    expect(normalizarTipoArticulo("OTRO")).toBeNull();
    expect(normalizarTipoArticulo(null)).toBeNull();
    expect(etiquetaTipoArticulo("MEDIDA")).toBe("Por medida");
    expect(etiquetaTipoArticulo(null)).toBe("Sin tipo");
    expect(tonoTipoArticulo(undefined)).toBe("neutral");
  });

  it("la unidad sale del tipo; sin tipo, la del producto o piezas", () => {
    expect(unidadDeArticulo("MEDIDA", "pza")).toBe("m");
    expect(unidadDeArticulo("CONSUMIBLE")).toBe("pz");
    expect(unidadDeArticulo(null, "caja")).toBe("caja");
    expect(unidadDeArticulo(null, "")).toBe("pz");
  });
});

describe("chips de la búsqueda rápida", () => {
  it("Todos · Herramientas · Equipo · Consumibles · Por medida", () => {
    expect(FILTROS_BUSQUEDA.map((f) => f.etiqueta)).toEqual([
      "Todos",
      "Herramientas",
      "Equipo",
      "Consumibles",
      "Por medida",
    ]);
  });

  it("sin acceso al almacén no se pinta ninguno (solo habría herramientas)", () => {
    expect(filtrosVisibles(true)).toHaveLength(5);
    expect(filtrosVisibles(false)).toEqual([]);
  });

  it("reconoce los tipos válidos de búsqueda", () => {
    expect(esTipoBusqueda("TODOS")).toBe(true);
    expect(esTipoBusqueda("HERRAMIENTA")).toBe(true);
    expect(esTipoBusqueda("herramienta")).toBe(false);
    expect(esTipoBusqueda("SIN_TIPO")).toBe(false);
  });
});

describe("previaEmpaque", () => {
  it("dice cuánto trae uno", () => {
    expect(previaEmpaque("Bote", "100", "pz")).toBe("1 bote = 100 pz");
    expect(previaEmpaque("Bobina", 305, "m")).toBe("1 bobina = 305 m");
  });

  it("sin nombre o sin cifra válida no hay vista previa", () => {
    expect(previaEmpaque("", 100, "pz")).toBeNull();
    expect(previaEmpaque("Bote", "", "pz")).toBeNull();
    expect(previaEmpaque("Bote", "0", "pz")).toBeNull();
    expect(previaEmpaque("Bote", "abc", "pz")).toBeNull();
  });
});

describe("textoExistencia", () => {
  it("consumible: empaques completos más las piezas sueltas", () => {
    expect(textoExistencia(340, BOTE)).toBe("3 botes + 40 pz (340 pz)");
    expect(textoExistencia(340, BOTE, "pz", { conTotal: false })).toBe("3 botes + 40 pz");
  });

  it("por medida: bobinas y metros", () => {
    expect(textoExistencia(730, BOBINA, "m")).toBe("2 bobinas + 120 m (730 m)");
  });

  it("empaques justos no dicen «+ 0»", () => {
    expect(textoExistencia(300, BOTE)).toBe("3 botes (300 pz)");
    expect(textoExistencia(100, BOTE, "pz", { conTotal: false })).toBe("1 bote");
  });

  it("menos de un empaque, o sin empaque, va en la unidad base", () => {
    expect(textoExistencia(40, BOTE)).toBe("40 pz");
    expect(textoExistencia(4, null)).toBe("4 pz");
    expect(textoExistencia("12.5000", null, "m")).toBe("12.5 m");
  });

  it("en cero dice «Sin existencia»", () => {
    expect(textoExistencia(0, BOTE)).toBe("Sin existencia");
    expect(textoExistencia(null, null)).toBe("Sin existencia");
  });

  it("una existencia negativa no se reparte en empaques", () => {
    expect(textoExistencia(-5, BOTE)).toBe("-5 pz");
  });
});

describe("validarArticulo", () => {
  const base = { ...FORM_ARTICULO_VACIO, nombre: "Cincho negro 20 cm" };

  it("el tipo es obligatorio", () => {
    const r = validarArticulo(base);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.tipo).toBe("Elige el tipo de artículo.");
  });

  it("una herramienta no se da de alta aquí", () => {
    const r = validarArticulo({ ...base, tipo: "HERRAMIENTA" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.tipo).toMatch(/Herramientas/);
  });

  it("consumible con empaque: manda tipo, unidad y empaque", () => {
    const r = validarArticulo({
      ...base,
      tipo: "CONSUMIBLE",
      sku: " cin-20 ",
      categoria: "Fijación",
      empaqueNombre: " Bote ",
      empaqueCapacidad: "100",
    });
    expect(r).toEqual({
      ok: true,
      payload: {
        name: "Cincho negro 20 cm",
        sku: "cin-20",
        category: "Fijación",
        tipoArticulo: "CONSUMIBLE",
        unitName: "pz",
        empaque: { nombre: "Bote", capacidad: 100 },
      },
    });
  });

  it("por medida manda metros", () => {
    const r = validarArticulo({ ...base, nombre: "Cable UTP Cat6", tipo: "MEDIDA", empaqueNombre: "Bobina", empaqueCapacidad: "305" });
    expect(r.ok && r.payload).toMatchObject({ tipoArticulo: "MEDIDA", unitName: "m", empaque: { nombre: "Bobina", capacidad: 305 } });
  });

  it("el empaque va completo o no va", () => {
    const sinCifra = validarArticulo({ ...base, tipo: "CONSUMIBLE", empaqueNombre: "Bote" });
    expect(!sinCifra.ok && sinCifra.errores.empaqueCapacidad).toBe("Escribe cuántas piezas trae.");
    const metrosEnCero = validarArticulo({ ...base, tipo: "MEDIDA", empaqueNombre: "Bobina", empaqueCapacidad: "0" });
    expect(!metrosEnCero.ok && metrosEnCero.errores.empaqueCapacidad).toBe("Escribe cuántos metros trae.");
    const sinNombre = validarArticulo({ ...base, tipo: "MEDIDA", empaqueCapacidad: "305" });
    expect(!sinNombre.ok && sinNombre.errores.empaqueNombre).toMatch(/presentación/);
    const vacio = validarArticulo({ ...base, tipo: "CONSUMIBLE" });
    expect(vacio.ok && vacio.payload.empaque).toBeUndefined();
  });

  it("equipo no lleva empaque aunque haya quedado algo escrito", () => {
    const r = validarArticulo({ ...base, nombre: "Monitor 24 in", tipo: "EQUIPO", empaqueNombre: "Caja", empaqueCapacidad: "1" });
    expect(r).toEqual({ ok: true, payload: { name: "Monitor 24 in", tipoArticulo: "EQUIPO", unitName: "pz" } });
  });

  it("al editar no manda la unidad, para no pisar la de un producto viejo", () => {
    const r = validarArticulo({ ...base, tipo: "CONSUMIBLE" }, "editar");
    expect(r.ok && r.payload.unitName).toBeUndefined();
  });

  it("al editar tampoco manda el SKU (no se cambia por aquí)", () => {
    const r = validarArticulo({ ...base, tipo: "EQUIPO", sku: "MON-24" }, "editar");
    expect(r).toEqual({ ok: true, payload: { name: "Cincho negro 20 cm", tipoArticulo: "EQUIPO" } });
  });
});

describe("existenciaCorta (columna de las listas)", () => {
  it("con empaque, sin el total entre paréntesis", () => {
    expect(existenciaCorta(340, BOTE)).toBe("3 botes + 40 pz");
    expect(existenciaCorta("730.0000", BOBINA, "m")).toBe("2 bobinas + 120 m");
  });

  it("en cero da la cifra, no «Sin existencia» (el semáforo ya lo dice)", () => {
    expect(existenciaCorta(0, BOTE)).toBe("0 pz");
    expect(existenciaCorta(null, null, "m")).toBe("0 m");
  });

  it("sin empaque, la unidad base", () => {
    expect(existenciaCorta(4, null)).toBe("4 pz");
  });
});

describe("empaqueDeProducto", () => {
  it("toma el marcado para compra", () => {
    const producto = {
      packagings: [
        { nombre: "Caja", piezasPorUnidad: "1000.0000", esDefaultCompra: false },
        { nombre: "Bote", piezasPorUnidad: "100.0000", esDefaultCompra: true },
      ],
    };
    expect(empaqueDeProducto(producto)).toEqual({ nombre: "Bote", piezasPorUnidad: 100 });
  });

  it("sin marcado, el más grande; acepta `empaques` y descarta basura", () => {
    const producto = { empaques: [null, { nombre: "Bolsa", piezasPorUnidad: 50 }, { nombre: "", piezasPorUnidad: 9 }, { nombre: "Caja", piezasPorUnidad: 0 }] };
    expect(empaqueDeProducto(producto)).toEqual({ nombre: "Bolsa", piezasPorUnidad: 50 });
  });

  it("sin empaques o sin producto, null", () => {
    expect(empaqueDeProducto({})).toBeNull();
    expect(empaqueDeProducto(null)).toBeNull();
  });
});

describe("formArticuloDeProducto", () => {
  it("llena el formulario de edición con el tipo y el empaque", () => {
    expect(
      formArticuloDeProducto({ tipoArticulo: "CONSUMIBLE", name: "Cincho", sku: "CIN-20", category: "—" }, { nombre: "Bote", piezasPorUnidad: "100.0000" }),
    ).toEqual({ tipo: "CONSUMIBLE", nombre: "Cincho", sku: "CIN-20", categoria: "", empaqueNombre: "Bote", empaqueCapacidad: "100" });
  });

  it("un producto viejo queda sin tipo y el equipo sin empaque", () => {
    expect(formArticuloDeProducto({ name: "Monitor" }).tipo).toBeNull();
    const equipo = formArticuloDeProducto({ tipoArticulo: "EQUIPO", name: "NVR" }, { nombre: "Caja", piezasPorUnidad: 1 });
    expect(equipo.empaqueNombre).toBe("");
  });
});
