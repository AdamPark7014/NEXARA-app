import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agregarEvidenciaMovimiento,
  createStockMovement,
  evidenciaDeSalida,
  listCatalogProducts,
  seriesDeTexto,
} from "./stock-api";

describe("Números de serie de un movimiento", () => {
  it("uno por renglón, en mayúsculas y sin repetir", () => {
    expect(seriesDeTexto("ds-001\nDS-002\n ds-001 \n\n")).toEqual(["DS-001", "DS-002"]);
  });

  it("también acepta coma o punto y coma, como se pegan de una hoja", () => {
    expect(seriesDeTexto("A1, B2;C3")).toEqual(["A1", "B2", "C3"]);
  });

  it("ignora lo que no cabe como serie", () => {
    expect(seriesDeTexto("X".repeat(81))).toEqual([]);
  });
});

describe("Qué le falta de evidencia a una salida", () => {
  it("una salida sin nada queda marcada completa: sin foto, sin responsable y sin ligar", () => {
    expect(evidenciaDeSalida({ type: "DISPATCH" })).toMatchObject({
      esSalida: true,
      sinFoto: true,
      sinResponsable: true,
      sinLigar: true,
    });
  });

  it("con foto, quien recibe y actividad no le falta nada", () => {
    const ev = evidenciaDeSalida({
      type: "DISPATCH",
      fotos: [{ url: "/uploads/almacen/a" }],
      series: ["A1", "A2"],
      recibidoPor: { id: 3, nombre: "Antonio" },
      activity: { id: 9, anNumber: "AN-120" },
    });
    expect(ev).toMatchObject({ fotos: 1, series: 2, sinFoto: false, sinResponsable: false, sinLigar: false });
  });

  it("una entrada no se marca como incompleta aunque no traiga fotos", () => {
    expect(evidenciaDeSalida({ type: "RECEIPT" })).toMatchObject({ esSalida: false, sinFoto: false, sinResponsable: false });
  });
});

describe("Salida de almacén con evidencia", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("manda quién recibe, la actividad y las series con el movimiento", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":55}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const creado = await createStockMovement("tok", {
      type: "DISPATCH",
      productId: 4,
      fromWarehouseId: 1,
      quantity: 2,
      series: ["A1", "A2"],
      recibidoPorId: 3,
      activityId: 9,
    });
    expect(creado?.id).toBe(55);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init.body)).toMatchObject({ series: ["A1", "A2"], recibidoPorId: 3, activityId: 9 });
  });

  it("las fotos suben como formulario sobre el movimiento ya hecho", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await agregarEvidenciaMovimiento("tok", 55, {
      fotos: [new File(["x"], "a.jpg", { type: "image/jpeg" })],
      series: ["A1", "A2"],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("stock/movements/55/evidencia");
    const form = init.body as FormData;
    expect(form.getAll("fotos")).toHaveLength(1);
    expect(form.get("series")).toBe("A1\nA2");
    expect(init.headers["Content-Type"]).toBeUndefined();
  });
});

/** El selector de producto del movimiento solo traía los primeros 200: con un catálogo más grande, el resto no se podía elegir. */
describe("Catálogo completo para los selectores de almacén", () => {
  afterEach(() => vi.unstubAllGlobals());

  const producto = (i: number) => ({ id: i, name: `Producto ${i}`, sku: `SKU-${String(i).padStart(4, "0")}` });
  const pagina = (desde: number, cuantos: number, total: number) =>
    new Response(JSON.stringify({ data: Array.from({ length: cuantos }, (_, k) => producto(desde + k + 1)), total }), { status: 200 });
  const ruta = (llamada: unknown[]) => String(llamada[0]);

  it("un catálogo de más de 200 productos llega entero, página por página", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pagina(0, 200, 450))
      .mockResolvedValueOnce(pagina(200, 200, 450))
      .mockResolvedValueOnce(pagina(400, 50, 450));
    vi.stubGlobal("fetch", fetchMock);
    const lista = await listCatalogProducts("tok");
    expect(lista).toHaveLength(450);
    expect(lista[0].id).toBe(1);
    expect(lista[449].id).toBe(450);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(ruta(fetchMock.mock.calls[0])).toContain("catalog/products?take=200");
    expect(ruta(fetchMock.mock.calls[0])).not.toContain("skip=");
    expect(ruta(fetchMock.mock.calls[1])).toContain("catalog/products?take=200&skip=200");
    expect(ruta(fetchMock.mock.calls[2])).toContain("catalog/products?take=200&skip=400");
  });

  it("un catálogo corto se pide una sola vez", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(pagina(0, 37, 37));
    vi.stubGlobal("fetch", fetchMock);
    expect(await listCatalogProducts("tok")).toHaveLength(37);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("si el total cae justo en el fin de una página no pide una página vacía de más", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(pagina(0, 200, 400)).mockResolvedValueOnce(pagina(200, 200, 400));
    vi.stubGlobal("fetch", fetchMock);
    expect(await listCatalogProducts("tok")).toHaveLength(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("un servidor que contesta la lista suelta, sin total, también sirve", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([producto(1), producto(2)]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await listCatalogProducts("tok")).toEqual([producto(1), producto(2)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("si una página falla, falla la carga: no entrega medio catálogo como si fuera todo", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pagina(0, 200, 450))
      .mockResolvedValueOnce(new Response('{"message":"El servidor tuvo un problema"}', { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(listCatalogProducts("tok")).rejects.toThrow("El servidor tuvo un problema");
  });

  it("un producto que se repite entre páginas sale una sola vez", async () => {
    const repetida = new Response(JSON.stringify({ data: [producto(200), producto(201)], total: 201 }), { status: 200 });
    const fetchMock = vi.fn().mockResolvedValueOnce(pagina(0, 200, 201)).mockResolvedValueOnce(repetida);
    vi.stubGlobal("fetch", fetchMock);
    const lista = await listCatalogProducts("tok");
    expect(lista.map((p) => p.id)).toEqual(Array.from({ length: 201 }, (_, k) => k + 1));
  });

  it("no pide para siempre si el servidor contesta siempre la misma página", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => pagina(0, 200, 1_000_000));
    vi.stubGlobal("fetch", fetchMock);
    const lista = await listCatalogProducts("tok");
    expect(lista).toHaveLength(200);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
