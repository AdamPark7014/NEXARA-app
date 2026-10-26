import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DetalleModal } from "./reportes-contabilidad";

/**
 * El detalle de una línea de un reporte contable. Si no abre, el aviso dice la causa que
 * dio el servidor (no un texto fijo que la tape) y Reintentar vuelve a pedirlo.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DetalleModal", () => {
  it("si la línea no abre, dice la causa del servidor y Reintentar la vuelve a pedir", async () => {
    const fetchMock = vi.fn(async () => json({ message: "El periodo de octubre está cerrado.", statusCode: 409 }, 409));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DetalleModal abierto titulo="Ventas de octubre" path="contabilidad/reportes/detalle?cuenta=4100" token="jwt" onClose={() => {}} />,
    );

    expect(await screen.findByText("No se pudo abrir el detalle de esta línea")).toBeTruthy();
    expect(screen.getByText("El periodo de octubre está cerrado; si sigue igual, exporta el reporte.")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
