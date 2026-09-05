import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import IntegraSettingsPage from "./page";

/**
 * Sitios es la pantalla desde la que se borra una conexión entera y se decide
 * qué módulos ve el operador. Estas pruebas fijan lo que la hacía peligrosa:
 * un `window.confirm` anónimo para borrar, y unos «conmutadores» que eran
 * botones tachados con opacidad — sin estado que un lector pudiera anunciar.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SITIO_ARTEMIS = {
  id: 7,
  name: "planta-norte",
  label: "Planta Norte",
  host: "https://hikcentral.ejemplo.com",
  provider: "ARTEMIS" as const,
  isActive: true,
  isDefault: true,
  lastSyncAt: "2026-09-01T10:00:00.000Z",
  modulesOverride: { anpr: false },
  serviceClientId: 3,
  _count: { cameras: 16, doors: 9, people: 120, vehicles: 4 },
};

const SITIO_HCT = {
  ...SITIO_ARTEMIS,
  id: 8,
  name: "sucursal-sur",
  label: "Sucursal Sur",
  host: "https://area.hik-connect.com",
  provider: "HCT" as const,
  isDefault: false,
  modulesOverride: null,
  serviceClientId: null,
};

/** Ruta → cuerpo. Lo que no esté listado responde una lista vacía. */
function servidor(rutas: Record<string, () => Response>) {
  const llamadas: Array<{ url: string; method: string }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    llamadas.push({ url, method: (init?.method || "GET").toUpperCase() });
    for (const [trozo, responder] of Object.entries(rutas)) {
      if (url.includes(trozo)) return responder();
    }
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return llamadas;
}

async function pintarConSitios(sitios: unknown[]) {
  const llamadas = servidor({ "integra/sites": () => json(sitios) });
  render(<IntegraSettingsPage />);
  await screen.findByText("Planta Norte");
  return llamadas;
}

describe("Sitios · borrar deja de ser un confirm anónimo", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("no usa el diálogo nativo del navegador", async () => {
    const confirmNativo = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmNativo);
    const user = userEvent.setup();
    const llamadas = await pintarConSitios([SITIO_ARTEMIS]);

    await user.click(screen.getByRole("button", { name: /Eliminar el sitio Planta Norte/ }));

    expect(confirmNativo).not.toHaveBeenCalled();
    // Y sobre todo: nada se ha borrado todavía.
    expect(llamadas.some((l) => l.method === "DELETE")).toBe(false);
  });

  it("el diálogo dice qué sitio es y qué inventario se lleva por delante", async () => {
    const user = userEvent.setup();
    await pintarConSitios([SITIO_ARTEMIS]);

    await user.click(screen.getByRole("button", { name: /Eliminar el sitio Planta Norte/ }));

    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("Planta Norte");
    expect(dialogo).toHaveTextContent("hikcentral.ejemplo.com");
    expect(dialogo).toHaveTextContent("16 cámaras");
    expect(dialogo).toHaveTextContent("9 puertas");
    // Y aclara lo que NO se toca, que es lo que el operador teme.
    expect(dialogo).toHaveTextContent("Los equipos no se tocan");
  });

  it("cancelar no manda ningún DELETE", async () => {
    const user = userEvent.setup();
    const llamadas = await pintarConSitios([SITIO_ARTEMIS]);

    await user.click(screen.getByRole("button", { name: /Eliminar el sitio Planta Norte/ }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(llamadas.some((l) => l.method === "DELETE")).toBe(false);
  });

  it("confirmar sí borra, y solo entonces", async () => {
    const user = userEvent.setup();
    const llamadas = await pintarConSitios([SITIO_ARTEMIS]);

    await user.click(screen.getByRole("button", { name: /Eliminar el sitio Planta Norte/ }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Eliminar sitio" }));

    await waitFor(() =>
      expect(
        llamadas.some((l) => l.method === "DELETE" && l.url.includes("integra/sites/7")),
      ).toBe(true),
    );
  });
});

describe("Sitios · los módulos son conmutadores, no botones tachados", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("cada módulo anuncia si está visible u oculto", async () => {
    const user = userEvent.setup();
    await pintarConSitios([SITIO_ARTEMIS]);

    await user.click(screen.getByText("Planta Norte"));

    const grupo = await screen.findByRole("group", { name: /Módulos visibles/ });
    expect(within(grupo).getByRole("switch", { name: /Video/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // `modulesOverride: { anpr: false }` — el único apagado del sitio.
    expect(within(grupo).getByRole("switch", { name: /ANPR/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("apagar un módulo manda el override completo, no solo la clave tocada", async () => {
    const user = userEvent.setup();
    const llamadas = servidor({
      "integra/sites/7": () => json({ ...SITIO_ARTEMIS, modulesOverride: { anpr: false, video: false } }),
      "integra/sites": () => json([SITIO_ARTEMIS]),
    });
    render(<IntegraSettingsPage />);
    await screen.findByText("Planta Norte");
    await user.click(screen.getByText("Planta Norte"));

    const grupo = await screen.findByRole("group", { name: /Módulos visibles/ });
    await user.click(within(grupo).getByRole("switch", { name: /Video/ }));

    await waitFor(() =>
      expect(
        llamadas.some((l) => l.method === "PATCH" && l.url.includes("integra/sites/7")),
      ).toBe(true),
    );
  });

  it("en Hik-Connect los módulos solo-Artemis se bloquean diciendo por qué", async () => {
    const user = userEvent.setup();
    servidor({ "integra/sites": () => json([SITIO_HCT]) });
    render(<IntegraSettingsPage />);
    await screen.findByText("Sucursal Sur");
    await user.click(screen.getByText("Sucursal Sur"));

    const grupo = await screen.findByRole("group", { name: /Módulos visibles/ });
    const personas = within(grupo).getByRole("switch", { name: /Personas/ });
    expect(personas).toBeDisabled();
    expect(personas).toHaveTextContent("Artemis");
    // Video sí existe en HCT: no se bloquea de más.
    expect(within(grupo).getByRole("switch", { name: /Video/ })).toBeEnabled();
  });
});

describe("Sitios · el fallo dice cuál es", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("un 403 se lee como permiso y no ofrece reintentar", async () => {
    servidor({
      "integra/sites": () => json({ message: "Sin permiso para administrar sitios" }, 403),
    });
    render(<IntegraSettingsPage />);

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("No tienes permiso");
    expect(aviso).toHaveAttribute("data-tone", "warn");
    expect(screen.queryByRole("button", { name: /Reintentar/ })).toBeNull();
  });

  it("un servidor caído se lee como caída y sí ofrece reintentar", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<IntegraSettingsPage />);

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("El servidor no responde");
    expect(aviso).toHaveAttribute("data-tone", "danger");
    expect(screen.getByRole("button", { name: "Reintentar la carga" })).toBeEnabled();
  });
});
