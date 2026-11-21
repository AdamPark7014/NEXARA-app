import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverToolRequest, normalizeToolRequestRow, returnToolRequest } from "./tool-requests-api";

function foto(nombre: string) {
  return new File(["x"], nombre, { type: "image/jpeg" });
}

describe("Entregar herramienta (B4, 18-11-2026)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("manda el código de recolección que exige el servidor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await deliverToolRequest("tok", 7, " A1B2 ");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("tool-requests/7/deliver");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ pickupCode: "A1B2" });
  });

  it("con fotos de antes viaja como formulario, sin imponer el Content-Type de JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await deliverToolRequest("tok", 7, " A1B2 ", { fotos: [foto("a.jpg"), foto("b.jpg")], recogidaPorId: 3 });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("pickupCode")).toBe("A1B2");
    expect(form.get("recogidaPorId")).toBe("3");
    expect(form.getAll("fotos")).toHaveLength(2);
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect(init.headers.Authorization).toBe("Bearer tok");
  });
});

describe("Recibir herramienta con evidencia (21-11-2026)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("manda la condición, qué le pasó y las fotos de después", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await returnToolRequest("tok", 9, { condicion: "DANADA", descripcion: " Pantalla rota ", fotos: [foto("d.jpg")] });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("tool-requests/9/return");
    const form = init.body as FormData;
    expect(form.get("condicion")).toBe("DANADA");
    expect(form.get("damageDescription")).toBe("Pantalla rota");
    expect(form.getAll("fotos")).toHaveLength(1);
  });

  it("la forma corta de antes sigue mandando solo el daño", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await returnToolRequest("tok", 9, " Cable pelado ");
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init.body)).toEqual({ damageDescription: "Cable pelado" });
  });
});

describe("Fila de préstamo", () => {
  it("lee a quien la pidió y quien aprobó como los manda el servidor (antes salía «N/A»)", () => {
    const fila = normalizeToolRequestRow({
      id: 5,
      toolName: "Multímetro",
      status: "IN_USE",
      approvedBy: 2,
      usuario: { id: 3, nombre: "Antonio", email: "tecnico@example.com" },
      approver: { id: 2, nombre: "Iván" },
    });
    expect(fila.requestedByName).toBe("Antonio");
    expect(fila.requestedByEmail).toBe("tecnico@example.com");
    expect(fila.approvedByName).toBe("Iván");
  });

  it("trae la evidencia: fotos, condición y quién entregó y recibió", () => {
    const fila = normalizeToolRequestRow({
      id: 5,
      status: "DAMAGED",
      deliveryPhotos: [{ url: "/uploads/tools/a" }, "/uploads/tools/b"],
      returnPhotos: [{ url: "/uploads/tools/c" }],
      returnCondition: "INCOMPLETA",
      damageDescription: "Falta la punta roja",
      deliveredBy: { id: 2, nombre: "Iván" },
      receivedBy: { id: 1, nombre: "Christian" },
      pickedUpBy: { id: 3, nombre: "Antonio" },
      activity: { id: 9, anNumber: "AN-120", titulo: "Instalación día 1" },
      pickupCode: "A3F7KD",
    });
    expect(fila.deliveryPhotos).toEqual(["/uploads/tools/a", "/uploads/tools/b"]);
    expect(fila.returnPhotos).toEqual(["/uploads/tools/c"]);
    expect(fila.returnCondition).toBe("INCOMPLETA");
    expect(fila.deliveredByName).toBe("Iván");
    expect(fila.receivedByName).toBe("Christian");
    expect(fila.pickedUpByName).toBe("Antonio");
    expect(fila.activityLabel).toBe("AN-120 · Instalación día 1");
    expect(fila.pickupCode).toBe("A3F7KD");
  });

  it("un préstamo de antes de la evidencia llega sin fotos y sin tumbar la tabla", () => {
    const fila = normalizeToolRequestRow({ id: 1, status: "RETURNED", returnCondition: "RARA" });
    expect(fila.deliveryPhotos).toEqual([]);
    expect(fila.returnPhotos).toEqual([]);
    expect(fila.returnCondition).toBeNull();
    expect(fila.deliveredByName).toBeNull();
  });
});
