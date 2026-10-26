import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import PersonalCalendar from "./PersonalCalendar";

/**
 * Mi agenda. Lo que se defiende: si al actualizar falla, el aviso dice la causa del
 * servidor y que se sigue viendo la última versión; y cada evento conserva quién y qué.
 */

// El mismo objeto en cada render: la agenda recarga cuando cambia el token.
vi.mock("@/components/UserContext", () => {
  const sesion = { user: { id: 7, nombre: "Ana López", token: "jwt" } };
  return { useUser: () => sesion };
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const evento = {
  id: "crm-1",
  source: "CRM",
  type: "cita",
  title: "Visita a Bachoco",
  description: "Revisar las cámaras de la planta 2",
  start: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  ownerName: "Ana López",
  color: "#0e7490",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PersonalCalendar", () => {
  it("si actualizar falla, dice la causa del servidor y que se ve la última versión", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([evento]))
      .mockResolvedValueOnce(json({ message: "El calendario está en mantenimiento.", statusCode: 503 }, 503));
    vi.stubGlobal("fetch", fetchMock);

    render(<PersonalCalendar />);
    expect(await screen.findByText("Visita a Bachoco")).toBeTruthy();
    // Quién y qué, cada uno en su propio elemento (a 390 px van en renglones distintos).
    expect(screen.getByText("Revisar las cámaras de la planta 2")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /Actualizar/ }));
    expect(await screen.findByText("No pudimos actualizar tu agenda")).toBeTruthy();
    expect(screen.getByText("El calendario está en mantenimiento; mostramos la última versión.")).toBeTruthy();
    // La agenda que ya había se sigue viendo.
    expect(screen.getByText("Visita a Bachoco")).toBeTruthy();
  });
});
