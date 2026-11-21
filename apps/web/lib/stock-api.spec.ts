import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agregarEvidenciaMovimiento,
  createStockMovement,
  evidenciaDeSalida,
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
