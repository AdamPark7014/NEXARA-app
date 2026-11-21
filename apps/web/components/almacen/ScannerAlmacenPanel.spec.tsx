import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ScannerAlmacenPanel from "./ScannerAlmacenPanel";

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, nombre: "Almacén", token: "jwt", permissions: ["stock.manage"] } }),
}));

type Llamada = { url: string; init?: RequestInit };

/** Servidor de mentira: contesta por ruta y guarda lo que se le pidió. */
function servidor() {
  const llamadas: Llamada[] = [];
  const json = (cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: 200 });
  const fetchMock = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    llamadas.push({ url, init });
    if (url.includes("stock/barcode")) {
      return json({ match: "producto", codigoBarras: "750100", product: { id: 4, sku: "CAM-01", name: "Cámara domo 4 MP" } });
    }
    if (url.includes("/actividades")) return json([{ id: 9, anNumber: "AN-120", titulo: "Instalación día 1", projectId: 2 }]);
    if (url.includes("stock/receptores")) return json([{ id: 3, nombre: "Antonio" }]);
    if (url.includes("/evidencia")) return json({ id: 55 });
    if (url.includes("stock/movements")) return json({ id: 55, movementNumber: "MOV-55" });
    if (url.includes("warehouse")) return json([{ id: 1, name: "Almacén central" }]);
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return llamadas;
}

async function escanearYElegirSalida() {
  await userEvent.type(screen.getByLabelText("Código de barras"), "750100");
  await userEvent.click(screen.getByRole("button", { name: /Buscar/ }));
  await screen.findByText("Cámara domo 4 MP");
  await userEvent.selectOptions(screen.getByLabelText("Qué pasó"), "DISPATCH");
}

beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:foto"), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Salida de material por escáner (evidencia, 21-11-2026)", () => {
  it("sin decir quién se lo lleva no registra la salida", async () => {
    const llamadas = servidor();
    render(<ScannerAlmacenPanel />);
    await escanearYElegirSalida();
    await userEvent.click(screen.getByRole("button", { name: "Registrar movimiento" }));
    expect(await screen.findByText("Elige quién se lleva el material")).toBeInTheDocument();
    expect(llamadas.some((l) => l.init?.method === "POST")).toBe(false);
  });

  it("sin foto de lo que sale tampoco", async () => {
    const llamadas = servidor();
    render(<ScannerAlmacenPanel />);
    await escanearYElegirSalida();
    await userEvent.selectOptions(await screen.findByLabelText(/Quién se lo lleva/), "3");
    await userEvent.click(screen.getByRole("button", { name: "Registrar movimiento" }));
    expect(await screen.findByText("Toma al menos una foto de lo que sale")).toBeInTheDocument();
    expect(llamadas.some((l) => l.init?.method === "POST")).toBe(false);
  });

  it("con responsable, actividad, serie y foto registra la salida y sube la foto al movimiento", async () => {
    const llamadas = servidor();
    const { container } = render(<ScannerAlmacenPanel />);
    await escanearYElegirSalida();
    await screen.findByRole("option", { name: "Antonio" });
    await userEvent.selectOptions(screen.getByLabelText(/Quién se lo lleva/), "3");
    await screen.findByRole("option", { name: "AN-120 · Instalación día 1" });
    await userEvent.selectOptions(screen.getByLabelText(/Para qué actividad/), "9");
    await userEvent.type(screen.getByLabelText(/Números de serie/), "ds-001");
    await userEvent.upload(
      container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["x"], "sale.jpg", { type: "image/jpeg" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Registrar movimiento" }));

    await waitFor(() => expect(llamadas.some((l) => l.url.includes("stock/movements/55/evidencia"))).toBe(true));
    const alta = llamadas.find((l) => l.url.endsWith("stock/movements") && l.init?.method === "POST")!;
    expect(JSON.parse(String(alta.init!.body))).toMatchObject({
      type: "DISPATCH",
      productId: 4,
      recibidoPorId: 3,
      activityId: 9,
      series: ["DS-001"],
    });
    const evidencia = llamadas.find((l) => l.url.includes("/evidencia"))!;
    expect((evidencia.init!.body as FormData).getAll("fotos")).toHaveLength(1);
  });
});
