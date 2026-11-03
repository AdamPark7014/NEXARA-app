import { describe, expect, it } from "vitest";
import { MODELOS_CAMARA, MODELO_GENERICO, MODELOS_EQUIPO, type FilaCatalogo } from "./catalogo";
import { ctDeFila, esModeloReal, lineaParaEnviar, modelosParaConsulta, pesos, renglonesDeCotizacion, totalesDe, type Disponibilidad } from "./existencias";
import type { GrupoEquipo } from "./sistema";

const fila = (over: Partial<FilaCatalogo> = {}): FilaCatalogo => ({ id: 8, familia: "grabacion", tipo: "nvr", marca: "Dahua", modelo: "DHI-NVR4108", descripcion: "Grabador", datos: { canales: 8 }, medidas: null, caracteristicas: [], fuente: "ficha", verificado: false, productId: null, ...over });

const grupo = (over: Partial<GrupoEquipo>): GrupoEquipo => ({ clave: "cam|hik-1", familia: "camaras", tipo: "domo", nombre: "Domo", modelo: "DS-1", foto: "", cantidad: 3, claves: [], watts: 0, mbps: 0, ...over });

const ct = (piezas: number, precio: number): Disponibilidad["ct"] => ({ clave: "CAM1", nombre: "", marca: "", modelo: "", piezas, cerca: 0, precio, dias: 1, ligado: "modelo" });

describe("modelosParaConsulta", () => {
  it("un tipo genérico no se busca: no es un producto", () => {
    expect(esModeloReal(MODELO_GENERICO)).toBe(false);
    expect(esModeloReal({ id: "tipo-gabinete-24u" })).toBe(false);
    expect(esModeloReal({ id: "db-3" })).toBe(true);
    const lista = modelosParaConsulta(MODELOS_CAMARA, MODELOS_EQUIPO, []);
    expect(lista.some((m) => m.clave.startsWith("tipo-"))).toBe(false);
    expect(lista.length).toBeGreaterThan(0);
  });

  it("lo agregado por la empresa lleva su producto y la clave de CT que se eligió", () => {
    const f = fila({ productId: 12, datos: { ficha: { ct: "NVRDAH700" } } });
    const [m] = modelosParaConsulta([], [{ id: "db-8", marca: "Dahua", modelo: "DHI-NVR4108" } as never], [f]);
    expect(m).toEqual({ clave: "db-8", marca: "Dahua", modelo: "DHI-NVR4108", productId: 12, ct: "NVRDAH700" });
  });

  it("sin clave elegida queda en null", () => {
    expect(ctDeFila(fila())).toBeNull();
    expect(ctDeFila(null)).toBeNull();
  });
});

describe("renglonesDeCotizacion", () => {
  const modelos: Record<string, { id: string; marca: string; modelo: string; descripcion: string }> = {
    "hik-1": { id: "hik-1", marca: "Hikvision", modelo: "DS-1", descripcion: "Domo 4 MP" },
    "tipo-sirena": { id: "tipo-sirena", marca: "", modelo: "Sirena", descripcion: "" },
  };
  const datos = { modeloDe: (c: string) => modelos[c] ?? null, filas: [] };

  it("dice lo que hay y lo que falta, usando primero Almacén y luego CT", () => {
    const d = new Map<string, Disponibilidad>([["hik-1", { clave: "hik-1", almacen: { productId: 1, sku: "DS-1", piezas: 1 }, ct: ct(1, 1200) }]]);
    const [r] = renglonesDeCotizacion([grupo({})], { bobinas: 0, cableM: 0 }, d, datos);
    expect(r).toMatchObject({ clave: "hik-1", cantidad: 3, almacen: 1, enCt: 1, precio: 1200, faltan: 1, nombre: "Domo · Hikvision DS-1", grupo: "EQUIPOS" });
  });

  it("si CT no lo tiene, no inventa ni piezas ni precio", () => {
    const [r] = renglonesDeCotizacion([grupo({})], { bobinas: 0, cableM: 0 }, new Map(), datos);
    expect(r).toMatchObject({ almacen: 0, enCt: null, precio: null, faltan: 3 });
  });

  it("un genérico va con lo que dice el plano y sin modelo que buscar", () => {
    const [r] = renglonesDeCotizacion([grupo({ clave: "eq|sirena|tipo-sirena", nombre: "Sirena", modelo: "Sirena con estrobo" })], { bobinas: 0, cableM: 0 }, new Map(), datos);
    expect(r).toMatchObject({ modelo: "", nombre: "Sirena · Sirena con estrobo", precio: null });
  });

  it("el cable va en bobinas y como material", () => {
    const lista = renglonesDeCotizacion([], { bobinas: 2, cableM: 480.4 }, new Map(), datos);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ grupo: "MATERIALES", cantidad: 2, unidad: "bobina", descripcion: "480 m de ruta según el diseño", precio: null });
  });

  it("sin cable no agrega renglón", () => {
    expect(renglonesDeCotizacion([], { bobinas: 0, cableM: 0 }, new Map(), datos)).toHaveLength(0);
  });
});

describe("totales y envío", () => {
  const d = new Map<string, Disponibilidad>([["hik-1", { clave: "hik-1", almacen: null, ct: ct(10, 1000) }]]);
  const lista = renglonesDeCotizacion([grupo({}), grupo({ clave: "cam|otro", cantidad: 2 })], { bobinas: 1, cableM: 100 }, d, { modeloDe: (c) => (c === "hik-1" ? { id: c, marca: "H", modelo: "DS-1", descripcion: "" } : null), filas: [] });

  it("suma solo lo que tiene precio y cuenta lo que no", () => {
    expect(totalesDe(lista)).toEqual({ sinIva: 3000, sinPrecio: 2, faltan: 2 });
  });

  it("el precio y las existencias no viajan: los pone el servidor", () => {
    const l = lineaParaEnviar(lista[0]);
    expect(l).not.toHaveProperty("precio");
    expect(l).not.toHaveProperty("almacen");
    expect(l).toMatchObject({ clave: "hik-1", cantidad: 3, grupo: "EQUIPOS" });
  });

  it("los pesos van sin centavos", () => {
    expect(pesos(1234.5)).toMatch(/1,23[45]/);
  });
});
