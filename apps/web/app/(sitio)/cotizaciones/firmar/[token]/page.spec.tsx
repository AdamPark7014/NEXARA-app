import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import FirmarCotizacionPage from "./page";

/**
 * La página pública donde el cliente firma la cotización. Lo que se defiende: un enlace
 * que no existe no ofrece reintentar, un fallo de carga sí, y si la firma falla el aviso
 * dice la causa del servidor sin quitarle al cliente el formulario.
 */

vi.mock("next/navigation", () => {
  const params = { token: "tok-123" };
  return { useParams: () => params };
});

const cotizacion = {
  quoteNumber: "NEX-0007",
  issueDate: "2026-10-20T12:00:00.000Z",
  validUntil: null,
  status: "ENVIADA",
  clientName: "Ana López",
  clientCompany: "Bachoco",
  clientEmail: "ana@example.com",
  projectName: "CCTV planta 2",
  currency: "MXN",
  subtotal: 100,
  discountTotal: 0,
  taxTotal: 16,
  total: 116,
  items: [{ id: 1, name: "Cámara", qty: 1, unitPrice: 100, lineTotal: 100 }],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function responder(...respuestas: Array<() => Response>) {
  const fetchMock = vi.fn(async () => {
    const siguiente = respuestas.length > 1 ? respuestas.shift()! : respuestas[0];
    return siguiente();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("firmar cotización", () => {
  it("si el enlace no existe lo dice y no ofrece reintentar", async () => {
    responder(() => json({ message: "Not Found", statusCode: 404 }, 404));
    render(<FirmarCotizacionPage />);
    expect(await screen.findByText("No se encontró la cotización.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });

  it("si no carga, dice la causa del servidor y Reintentar la vuelve a pedir", async () => {
    const fetchMock = responder(
      () => json({ message: "La cotización está en revisión", statusCode: 409 }, 409),
      () => json(cotizacion),
    );
    render(<FirmarCotizacionPage />);
    expect(await screen.findByText("La cotización está en revisión")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("NEX-0007")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("si la firma falla, el aviso trae la causa y el formulario sigue ahí para corregir", async () => {
    responder(
      () => json(cotizacion),
      () => json({ message: "El correo no coincide con el de la cotización", statusCode: 400 }, 400),
      () => json({ ok: true }),
    );
    render(<FirmarCotizacionPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Firmar cotización" }));
    expect(await screen.findByText("El correo no coincide con el de la cotización")).toBeTruthy();
    expect(screen.getByLabelText(/Correo/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Firmar cotización" }));
    expect(await screen.findByText("Gracias, tu firma quedó registrada.")).toBeTruthy();
  });

  it("sin red, la firma dice que no se pudo, sin el mensaje en inglés del navegador", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(cotizacion))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    render(<FirmarCotizacionPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Firmar cotización" }));
    await waitFor(() => expect(screen.getByText("No se pudo firmar la cotización.")).toBeTruthy());
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });
});
