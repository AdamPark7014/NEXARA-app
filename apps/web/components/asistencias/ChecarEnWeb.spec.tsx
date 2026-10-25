import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChecarEnWeb, { fetchVentanaWeb, textoAvisoAbierto } from "./ChecarEnWeb";

const oraciones = (texto: string) =>
  texto
    .split(/(?<=[.!?])\s+/)
    .map((parte) => parte.trim())
    .filter(Boolean);

/** Las tres frases que el ámbar abierto decía cuando había fecha de cierre. */
const TEXTO_VIEJO =
  "Abierto hasta el viernes 30 de octubre, 6:00 p.m. Tu checada queda marcada como hecha desde el navegador. Permite la cámara y la ubicación cuando el navegador te lo pida; si puedes, usa la app NEXARA.";

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

  it("abierta: el ámbar cabe en una frase y deja atrás el texto viejo", async () => {
    const hasta = "2026-10-31T00:00:00.000Z";
    const fecha = new Date(hasta).toLocaleString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
    });
    const viejoConDato = `Abierto hasta el ${fecha}. Tu checada queda marcada como hecha desde el navegador. Permite la cámara y la ubicación cuando el navegador te lo pida; si puedes, usa la app NEXARA.`;
    const aviso = textoAvisoAbierto(hasta);

    expect(oraciones(TEXTO_VIEJO)).toHaveLength(3);
    expect(oraciones(viejoConDato)).toHaveLength(3);
    expect(oraciones(aviso)).toEqual([aviso]);
    expect(aviso).toBe(
      `Abierto hasta el ${fecha}: tu checada queda marcada como hecha desde el navegador: permite la cámara y la ubicación cuando el navegador te lo pida y, si puedes, usa la app NEXARA.`,
    );
    expect(aviso).not.toBe(TEXTO_VIEJO);
    expect(aviso).not.toBe(viejoConDato);
    expect(aviso.startsWith(`Abierto hasta el ${fecha}`)).toBe(true);

    const sinFecha = textoAvisoAbierto(null);
    expect(oraciones(sinFecha)).toEqual([sinFecha]);
    expect(sinFecha).toBe(
      "Tu checada queda marcada como hecha desde el navegador: permite la cámara y la ubicación cuando el navegador te lo pida y, si puedes, usa la app NEXARA.",
    );

    vi.stubGlobal("fetch", respuesta({ abierta: true, hasta }));
    render(<ChecarEnWeb token="tok" />);
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain(aviso);
    expect(status.textContent).not.toContain(TEXTO_VIEJO);
    expect(status.textContent).not.toContain("navegador. Permite");
    expect(screen.getByTestId("formulario-checada")).toBeTruthy();
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
