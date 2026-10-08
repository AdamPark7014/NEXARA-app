import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buscarInventario,
  esErrorSinAcceso,
  esMismaPagina,
  hrefParaAbrir,
  idDeParametro,
  mensajeErrorBusqueda,
  normalizarRespuesta,
  quienesLaTienen,
  resultadoParaAbrir,
  type ResultadoBusqueda,
} from "./busqueda-inventario-api";

const TALADRO: ResultadoBusqueda = {
  origen: "herramienta",
  id: 7,
  tipo: "HERRAMIENTA",
  nombre: "Taladro DeWalt",
  detalle: "DCD771 · DeWalt",
  codigo: "HER-0007",
  codigoBarras: null,
  imagenUrl: null,
  estado: { texto: "2 disponibles · 1 prestada", tono: "success" },
  existencia: null,
  ubicacion: null,
  piezas: [
    { id: 7, codigo: "HER-0007", estado: "AVAILABLE", quienLaTiene: null },
    { id: 8, codigo: "HER-0008", estado: "ASSIGNED", quienLaTiene: "Juan Pérez" },
  ],
  href: "/erp/almacen/herramientas?herramienta=7",
};

const CINCHO: ResultadoBusqueda = {
  origen: "articulo",
  id: 3,
  tipo: "CONSUMIBLE",
  nombre: "Cincho negro 20 cm",
  detalle: "CIN-20",
  codigo: "CIN-20",
  codigoBarras: "7501234567890",
  imagenUrl: null,
  estado: null,
  existencia: { cantidad: 340, unidad: "pz", texto: "3 botes + 40 pz (340 pz)", bajoMinimo: false },
  ubicacion: "Bodega A-2",
  href: "/erp/almacen?producto=3",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizarRespuesta", () => {
  it("rellena lo que falte sin tronar", () => {
    const r = normalizarRespuesta({ resultados: [{ nombre: "Cincho", href: "/erp/almacen?producto=1", tipo: "consumible" }, { nombre: "" }] }, { q: "cin", tipo: "TODOS" });
    expect(r.q).toBe("cin");
    expect(r.incluyeAlmacen).toBe(false);
    expect(r.conteos).toEqual({ TODOS: 0, HERRAMIENTA: 0, EQUIPO: 0, CONSUMIBLE: 0, MEDIDA: 0, SIN_TIPO: 0 });
    expect(r.resultados).toHaveLength(1);
    expect(r.resultados[0]).toMatchObject({ origen: "articulo", tipo: "CONSUMIBLE", estado: null, existencia: null });
  });

  it("una herramienta siempre es de tipo HERRAMIENTA y un tono raro queda neutro", () => {
    const r = normalizarRespuesta(
      {
        incluyeAlmacen: true,
        conteos: { TODOS: "2", HERRAMIENTA: 1 },
        resultados: [{ origen: "herramienta", id: 7, nombre: "Taladro", href: "/x", estado: { texto: "1 disponible", tono: "morado" } }],
      },
      { q: "tal", tipo: "HERRAMIENTA" },
    );
    expect(r.conteos.TODOS).toBe(2);
    expect(r.resultados[0].tipo).toBe("HERRAMIENTA");
    expect(r.resultados[0].estado).toEqual({ texto: "1 disponible", tono: "neutral" });
  });

  it("basura no es respuesta, pero tampoco error", () => {
    expect(normalizarRespuesta(null, { q: "", tipo: "TODOS" }).resultados).toEqual([]);
  });
});

describe("resultadoParaAbrir (Enter / lector)", () => {
  it("abre el que coincide exacto por código, código de barras o pieza", () => {
    expect(resultadoParaAbrir([TALADRO, CINCHO], "cin-20")).toBe(CINCHO);
    expect(resultadoParaAbrir([TALADRO, CINCHO], "7501234567890")).toBe(CINCHO);
    expect(resultadoParaAbrir([TALADRO, CINCHO], "HER-0008")).toBe(TALADRO);
  });

  it("sin coincidencia exacta abre el único resultado si parece código", () => {
    expect(resultadoParaAbrir([CINCHO], "CIN2")).toBe(CINCHO);
    expect(resultadoParaAbrir([CINCHO], "cincho negro")).toBeNull();
    expect(resultadoParaAbrir([TALADRO, CINCHO], "dewalt")).toBeNull();
    expect(resultadoParaAbrir([CINCHO], "  ")).toBeNull();
  });
});

describe("quienesLaTienen", () => {
  const pieza = (quienLaTiene: string | null) => ({ id: 1, codigo: null, estado: "ASSIGNED", quienLaTiene });

  it("nombra a quien la trae, sin repetir", () => {
    expect(quienesLaTienen(TALADRO.piezas)).toBe("Con Juan Pérez");
    expect(quienesLaTienen([pieza("Ana"), pieza("Ana"), pieza("Luis")])).toBe("Con Ana y Luis");
    expect(quienesLaTienen([pieza("Ana"), pieza("Luis"), pieza("Eva"), pieza("Raúl")])).toBe("Con Ana, Luis y 2 más");
  });

  it("si todas están en el almacén no dice nada", () => {
    expect(quienesLaTienen([pieza(null), pieza(" ")])).toBeNull();
    expect(quienesLaTienen(undefined)).toBeNull();
  });
});

describe("a dónde lleva un resultado", () => {
  it("a la herramienta le suma el nombre para filtrar el inventario", () => {
    expect(hrefParaAbrir(TALADRO)).toBe("/erp/almacen/herramientas?herramienta=7&q=Taladro+DeWalt");
    expect(hrefParaAbrir({ ...TALADRO, href: "/erp/almacen/herramientas?herramienta=7&q=x" })).toBe(
      "/erp/almacen/herramientas?herramienta=7&q=x",
    );
  });

  it("el artículo va tal cual", () => {
    expect(hrefParaAbrir(CINCHO)).toBe("/erp/almacen?producto=3");
  });

  it("sabe si el enlace es de la misma página", () => {
    expect(esMismaPagina("/erp/almacen?producto=3", "/erp/almacen")).toBe(true);
    expect(esMismaPagina("/erp/almacen/herramientas?herramienta=7", "/erp/almacen")).toBe(false);
    expect(esMismaPagina("/erp/almacen/herramientas?herramienta=7", "/erp/almacen/herramientas/")).toBe(true);
    expect(esMismaPagina("https://otro.mx/erp/almacen", "/erp/almacen")).toBe(false);
  });

  it("lee el id de la query", () => {
    expect(idDeParametro("/erp/almacen?producto=3", "producto")).toBe(3);
    expect(idDeParametro("/erp/almacen?producto=abc", "producto")).toBeNull();
    expect(idDeParametro("/erp/almacen", "producto")).toBeNull();
  });
});

describe("mensajeErrorBusqueda", () => {
  it("sabe cuándo es falta de permiso", () => {
    expect(esErrorSinAcceso(new Error('{"message":"Forbidden resource","statusCode":403}'))).toBe(true);
    expect(esErrorSinAcceso(new Error('{"statusCode":404}'))).toBe(false);
  });

  it("un 404 es que el servidor todavía no tiene la búsqueda", () => {
    const err = new Error(JSON.stringify({ message: "Cannot GET /api/tool-requests/busqueda-rapida", statusCode: 404 }));
    expect(mensajeErrorBusqueda(err)).toMatch(/todavía no está disponible/);
  });

  it("sin permiso lo dice", () => {
    expect(mensajeErrorBusqueda(new Error('{"message":"Forbidden resource","statusCode":403}'))).toMatch(/No tienes acceso/);
  });

  it("lo demás usa el mensaje de la API o uno amable", () => {
    expect(mensajeErrorBusqueda(new Error('{"message":"q demasiado largo"}'))).toBe("q demasiado largo");
    expect(mensajeErrorBusqueda(new Error("<html>502</html>"))).toBe("No se pudo buscar en el inventario. Intenta de nuevo.");
  });
});

describe("buscarInventario", () => {
  it("pide el endpoint con q, tipo y límite", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ q: "cin", incluyeAlmacen: true, resultados: [CINCHO] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await buscarInventario("jwt", { q: " cin ", tipo: "CONSUMIBLE" });
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("tool-requests/busqueda-rapida?q=cin&tipo=CONSUMIBLE&limite=30");
    expect(r.resultados[0].nombre).toBe("Cincho negro 20 cm");
  });
});
