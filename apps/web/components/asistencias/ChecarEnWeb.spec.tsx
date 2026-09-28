import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChecarEnWeb, { fetchVentanaWeb } from "./ChecarEnWeb";

// El formulario real trae cámara y sockets: aquí solo importa cuándo se muestra.
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="formulario-checada">formulario</div> }));

afterEach(() => vi.unstubAllGlobals());

const respuesta = (cuerpo: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => cuerpo }) as unknown as Response);

describe("ChecarEnWeb", () => {
  it("cerrada (lo normal): solo dice que se checa desde la app y no ofrece el formulario", async () => {
    const f = respuesta({ abierta: false, hasta: null });
    vi.stubGlobal("fetch", f);
    render(<ChecarEnWeb token="tok" />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(screen.getByText(/Abre la app NEXARA/)).toBeTruthy();
    expect(screen.queryByTestId("formulario-checada")).toBeNull();
  });

  it("abierta: avisa que es temporal y hasta cuándo, y ofrece el formulario", async () => {
    vi.stubGlobal("fetch", respuesta({ abierta: true, hasta: "2026-09-30T23:59:00.000Z" }));
    render(<ChecarEnWeb token="tok" />);
    expect(await screen.findByTestId("formulario-checada")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/habilitado temporalmente/);
    expect(screen.getByRole("status").textContent).toMatch(/hasta el/);
    expect(screen.getByRole("status").textContent).toMatch(/hecha desde el\s+navegador/);
    expect(screen.queryByText(/Abre la app NEXARA/)).toBeNull();
  });

  it("si la consulta falla o no hay sesión, se queda como siempre (cerrada)", async () => {
    vi.stubGlobal("fetch", respuesta({}, false));
    render(<ChecarEnWeb token="tok" />);
    await waitFor(() => expect(screen.getByText(/Abre la app NEXARA/)).toBeTruthy());
    expect(screen.queryByTestId("formulario-checada")).toBeNull();

    const f = respuesta({ abierta: true, hasta: null });
    vi.stubGlobal("fetch", f);
    render(<ChecarEnWeb token={null} />);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("fetchVentanaWeb", () => {
  it("solo `abierta: true` cuenta como abierta; lo demás, cerrada", async () => {
    vi.stubGlobal("fetch", respuesta({ abierta: "si", hasta: 5 }));
    expect(await fetchVentanaWeb("t")).toEqual({ abierta: false, hasta: null });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red"); }));
    expect(await fetchVentanaWeb("t")).toEqual({ abierta: false, hasta: null });
  });
});
