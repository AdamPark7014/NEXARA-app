import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * «Completar códigos» en el inventario de herramientas: solo lo ve quien tiene
 * TOOLS_MANAGE, pide una confirmación ligera y avisa cuántas revisó y completó.
 */

const usuario = vi.hoisted(() => ({ actual: { id: 1, token: "jwt", permissions: ["tools.manage"] as string[] } }));
const completar = vi.hoisted(() => vi.fn());
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));

vi.mock("./UserContext", () => ({ useUser: () => ({ user: usuario.actual }) }));
vi.mock("@/lib/api-base", () => ({ buildApiUrl: (p: string) => `/api/${p}`, getSocketBaseUrl: () => "" }));
vi.mock("@/lib/realtime-socket", () => ({ createRealtimeSocket: () => ({ on: vi.fn(), disconnect: vi.fn() }) }));
vi.mock("@/lib/almacen-api", () => ({ completarCodigosHerramientas: completar }));
vi.mock("@/components/Toast", () => ({ toast: avisos }));
vi.mock("@/components/almacen/EtiquetasHerramientaDialog", () => ({ default: () => null }));

import ToolInventoryPanel from "./ToolInventoryPanel";

const herramienta = {
  id: 7,
  toolName: "Multímetro",
  model: "Fluke 117",
  serialNumber: "SN-1",
  codigoInterno: "MUL-00001",
  barcode: "MUL-00001",
  panoramicPhotoUrl: "",
  serialPhotoUrl: "",
  status: "AVAILABLE",
};

beforeEach(() => {
  usuario.actual = { id: 1, token: "jwt", permissions: ["tools.manage"] };
  completar.mockReset();
  Object.values(avisos).forEach((f) => f.mockReset());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("tool-requests/inventory") ? [herramienta] : []),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("inventario de herramientas · completar códigos", () => {
  it("con TOOLS_MANAGE confirma y avisa revisadas, completadas y errores", async () => {
    completar.mockResolvedValue({ revisadas: 3, completadas: 2, errores: [9] });
    render(<ToolInventoryPanel />);
    await screen.findByText("Multímetro");

    await userEvent.click(screen.getByRole("button", { name: /Completar códigos/ }));
    expect(screen.getByText("¿Completar los códigos de etiqueta?")).toBeInTheDocument();
    expect(completar).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Completar" }));
    await waitFor(() => expect(completar).toHaveBeenCalledWith("jwt"));
    await waitFor(() => expect(avisos.warning).toHaveBeenCalled());
    const texto = String(avisos.warning.mock.calls[0][0]);
    expect(texto).toContain("3 revisadas");
    expect(texto).toContain("2 completadas");
    expect(texto).toContain("1 con error");
  });

  it("sin errores el aviso es de éxito", async () => {
    completar.mockResolvedValue({ revisadas: 1, completadas: 1, errores: [] });
    render(<ToolInventoryPanel />);
    await screen.findByText("Multímetro");
    await userEvent.click(screen.getByRole("button", { name: /Completar códigos/ }));
    await userEvent.click(screen.getByRole("button", { name: "Completar" }));
    await waitFor(() => expect(avisos.success).toHaveBeenCalled());
  });

  it("sin TOOLS_MANAGE no aparece el botón", async () => {
    usuario.actual = { id: 2, token: "jwt", permissions: [] };
    render(<ToolInventoryPanel />);
    await screen.findByText("Multímetro");
    expect(screen.queryByRole("button", { name: /Completar códigos/ })).not.toBeInTheDocument();
  });
});
