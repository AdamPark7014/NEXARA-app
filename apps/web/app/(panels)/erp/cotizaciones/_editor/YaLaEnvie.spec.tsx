import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const marcarEnviada = vi.fn();
vi.mock("@/lib/cotizaciones-api", async (original) => ({
  ...(await original<typeof import("@/lib/cotizaciones-api")>()),
  marcarEnviada: (...a: unknown[]) => marcarEnviada(...a),
}));

import YaLaEnvie, { ProximosAvisos } from "./YaLaEnvie";
import { proximosAvisos } from "@/lib/cotizaciones-api";

describe("proximosAvisos", () => {
  const ahora = new Date("2026-11-03T18:00:00Z");
  it("en orden, con los días del seguimiento y tres días antes de vencer", () => {
    const a = proximosAvisos("2026-11-03T17:00:00Z", "2026-11-14T00:00:00Z", ahora);
    expect(a.map((x) => x.texto)).toEqual([
      "Te preguntamos si ya hubo respuesta",
      "Segundo recordatorio",
      "Aviso de por vencer, a ti y a tu jefe",
    ]);
    expect(a[0].fecha.toISOString()).toBe("2026-11-06T17:00:00.000Z");
    expect(a[2].fecha.toISOString()).toBe("2026-11-11T00:00:00.000Z");
  });
  it("lo que ya pasó no se enseña", () => {
    expect(proximosAvisos("2026-10-20T17:00:00Z", "2026-10-25T00:00:00Z", ahora)).toEqual([]);
  });
  it("sin fechas no inventa nada", () => {
    expect(proximosAvisos(null, null, ahora)).toEqual([]);
  });
});

describe("ProximosAvisos", () => {
  it("sin nada por delante no pinta nada", () => {
    const { container } = render(<ProximosAvisos sentAt="2020-01-01T00:00:00Z" validUntil="2020-02-01T00:00:00Z" />);
    expect(container.firstChild).toBeNull();
  });
});

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
