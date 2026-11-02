import { afterEach, describe, expect, it } from "vitest";
import { MODELOS_CAMARA, MODELOS_EQUIPO, equipoPorId, especificacionesCamara, especificacionesEquipo, leerFilasCatalogo, modeloPorId, registrarCatalogo, type FilaCatalogo } from "./catalogo";

const fila = (extra: Partial<FilaCatalogo>): FilaCatalogo => ({ id: 1, familia: "grabacion", tipo: "nvr", marca: "HIKVISION", modelo: "X", descripcion: "", datos: {}, medidas: null, caracteristicas: null, fuente: "manual", verificado: false, productId: null, ...extra });

describe("Catálogo de equipos", () => {
  afterEach(() => registrarCatalogo([], []));

  it("separa cámaras de lo demás y descarta lo que no entiende", () => {
    const { camaras, equipos } = leerFilasCatalogo([
      fila({ id: 1, datos: { canales: 16 } }),
      fila({ id: 2, familia: "camaras", tipo: "domo", datos: { optica: { pxHoriz: 2560, pxVert: 1440, focalMm: 2.8 }, wattsPoe: 7 } }),
      fila({ id: 3, familia: "camaras", tipo: "domo", datos: {} }),
      fila({ id: 4, tipo: "dron" }),
    ]);
    expect(equipos.map((e) => e.id)).toEqual(["db-1"]);
    expect(equipos[0].datos.canales).toBe(16);
    expect(camaras.map((c) => c.id)).toEqual(["db-2"]);
    expect(camaras[0].wattsPoe).toBe(7);
  });

  it("lo agregado se encuentra por su id en todo el diseñador", () => {
    expect(equipoPorId("db-1")).toBeNull();
    const { camaras, equipos } = leerFilasCatalogo([fila({ id: 1 }), fila({ id: 2, familia: "camaras", tipo: "bala", datos: { optica: { pxHoriz: 2560, pxVert: 1440, focalMm: 4 } } })]);
    registrarCatalogo(camaras, equipos);
    expect(equipoPorId("db-1")?.tipo).toBe("nvr");
    expect(modeloPorId("db-2")?.tipo).toBe("bala");
    expect(equipoPorId(MODELOS_EQUIPO[0].id)?.modelo).toBe(MODELOS_EQUIPO[0].modelo);
  });

  it("no presenta como real lo que no salió de una ficha", () => {
    for (const m of MODELOS_EQUIPO) {
      if (m.fuente === "tipo") {
        expect(m.verificado, m.modelo).toBe(false);
        expect(m.marca, m.modelo).toBe("");
      } else {
        expect(m.verificado, m.modelo).toBe(true);
      }
    }
  });

  it("la tarjeta lee solo lo que se sabe", () => {
    const nvr = MODELOS_EQUIPO.find((m) => m.modelo === "DS-7608NXI-K2")!;
    expect(especificacionesEquipo(nvr)).toBe("8 canales · 2 bahías · 80 Mbps · 1U · 385 × 52 × 315 mm");
    expect(especificacionesCamara(MODELOS_CAMARA[0])).toContain("MP");
  });
});
