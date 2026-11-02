import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const marcarEnviada = vi.fn();
vi.mock("@/lib/cotizaciones-api", async (original) => ({
  ...(await original<typeof import("@/lib/cotizaciones-api")>()),
  marcarEnviada: (...a: unknown[]) => marcarEnviada(...a),
}));

import YaLaEnvie from "./YaLaEnvie";

describe("YaLaEnvie", () => {
  // Con llaves: una función devuelta por `beforeEach` corre como limpieza al terminar la prueba.
  beforeEach(() => {
    marcarEnviada.mockReset();
  });

  it("un toque marca cómo salió y avisa el folio", async () => {
    marcarEnviada.mockResolvedValue({ id: 4, quoteNumber: "NEX-4-R1" });
    const alEnviar = vi.fn();
    render(<YaLaEnvie id={4} token="t" faltas={[]} alEnviar={alEnviar} onError={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    await waitFor(() => expect(alEnviar).toHaveBeenCalledWith("NEX-4-R1"));
    expect(marcarEnviada).toHaveBeenCalledWith("t", 4, "WHATSAPP");
  });

  it("si le falta algo, lo dice y no deja marcar", () => {
    render(<YaLaEnvie id={4} token="t" faltas={["elegir o crear el cliente"]} alEnviar={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByText(/Antes falta elegir o crear el cliente/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "WhatsApp" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("el error de la API le llega a la pantalla", async () => {
    marcarEnviada.mockImplementation(async () => {
      throw new Error("Elige o crea el cliente antes de enviar la cotización.");
    });
    const onError = vi.fn();
    render(<YaLaEnvie id={4} token="t" faltas={[]} alEnviar={vi.fn()} onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: "En persona" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Elige o crea el cliente antes de enviar la cotización."));
  });
});
