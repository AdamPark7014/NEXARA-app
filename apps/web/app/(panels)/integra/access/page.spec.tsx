import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import IntegraAccessPage from "./page";

/**
 * La consola de accesos cortaba las listas en seco: `slice(0, 24)` en puertas,
 * 40 en equipos y 80 en personas, sin decirlo. Un operador miraba 24 tarjetas
 * creyendo que ese era el sitio entero, y con eso decidía si una puerta estaba
 * abierta o no existía. No es un fallo estético: es información falsa.
 *
 * Aquí se fija que el recuento sea real, que un fallo produzca UN aviso, y que
 * los filtros viajen en la URL para poder pasarle a otro turno exactamente lo
 * que uno está viendo.
 */

const reemplazar = vi.fn();
let parametros = new URLSearchParams("");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: reemplazar, push: vi.fn() }),
  usePathname: () => "/integra/access",
  useSearchParams: () => parametros,
}));

// El reproductor abre WebSockets y MSE: en jsdom no aporta nada y sí ruido.
vi.mock("../_LivePlayer", () => ({
  IntegraLivePlayer: () => <div data-testid="video" />,
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function puertas(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `D${i + 1}`,
    name: `Puerta ${String(i + 1).padStart(2, "0")}`,
    location: i % 2 === 0 ? "Planta baja" : "Planta alta",
    online: true,
    status: i === 0 ? "remain_open" : "closed",
  }));
}

function servidor(rutas: Record<string, () => Response>) {
  const llamadas: Array<{ url: string; method: string }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    llamadas.push({ url, method: (init?.method || "GET").toUpperCase() });
    for (const [trozo, responder] of Object.entries(rutas)) {
      if (url.includes(trozo)) return responder();
    }
    return json({ items: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return llamadas;
}

/** Sitio con `n` puertas, ya pintado. */
async function consolaCon(n: number, extra: Record<string, () => Response> = {}) {
  const llamadas = servidor({
    "integra/doors": () => json({ total: n, source: "mirror", items: puertas(n) }),
    ...extra,
  });
  render(<IntegraAccessPage />);
  await screen.findByRole("status");
  return llamadas;
}

beforeEach(() => {
  reemplazar.mockClear();
  parametros = new URLSearchParams("");
  window.localStorage.clear();
});

describe("Accesos · el recorte se confiesa", () => {
  it("con 57 puertas dice que solo se ven 24, no las pinta y calla", async () => {
    await consolaCon(57);

    const recuento = screen.getByRole("status");
    expect(recuento).toHaveTextContent("Mostrando 24 de 57 puertas");
    // Y lo que se ve son 24 de verdad, no un número decorativo.
    expect(screen.getAllByRole("button", { name: /· ver detalle$/ })).toHaveLength(24);
  });

  it("«ver más» amplía y el recuento sigue siendo cierto", async () => {
    const user = userEvent.setup();
    await consolaCon(57);

    await user.click(screen.getByRole("button", { name: "Ver más puertas" }));
    expect(screen.getByRole("status")).toHaveTextContent("Mostrando 48 de 57 puertas");

    await user.click(screen.getByRole("button", { name: "Ver las 57 puertas" }));
    expect(screen.getByRole("status")).toHaveTextContent("Mostrando 57 de 57 puertas");
    expect(screen.queryByRole("button", { name: "Ver más puertas" })).toBeNull();
  });

  it("si caben todas no anuncia recorte ninguno", async () => {
    await consolaCon(6);
    const recuento = screen.getByRole("status");
    expect(recuento).toHaveTextContent("Mostrando 6 de 6 puertas");
    expect(screen.queryByRole("button", { name: /Ver más/ })).toBeNull();
  });

  it("al filtrar dice cuántas coinciden y cuántas había cargadas", async () => {
    const user = userEvent.setup();
    await consolaCon(57);

    await user.type(screen.getByPlaceholderText("nombre / región / id"), "Puerta 01");

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("57 cargadas sin filtro"),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Mostrando 1 de 1 puertas");
  });
});

describe("Accesos · de dónde sale el estado", () => {
  it("dice si está leyendo el espejo o el ACS, según lo declare el backend", async () => {
    await consolaCon(3);
    expect(screen.getByText(/espejo sincronizado/)).toBeInTheDocument();
  });

  it("una terminal caída se presenta como caída, no con su último estado", async () => {
    servidor({
      "integra/doors": () =>
        json({
          total: 1,
          source: "mirror",
          items: [{ id: "D1", name: "Torniquete", online: false, status: "closed" }],
        }),
    });
    render(<IntegraAccessPage />);
    await screen.findByRole("status");

    // Se mira la tarjeta, no la página: «Cerrada» también es una opción del
    // filtro de estado y ahí sí debe seguir existiendo.
    const tarjeta = screen.getByRole("button", { name: /^Torniquete · / });
    expect(tarjeta).toHaveTextContent("Equipo caído");
    expect(tarjeta).not.toHaveTextContent("Cerrada");
    expect(tarjeta).toHaveAccessibleName("Torniquete · Equipo caído · ver detalle");
  });
});

describe("Accesos · un fallo, un aviso", () => {
  it("un 403 al cargar sale una sola vez y como problema de permiso", async () => {
    servidor({
      "integra/doors": () => json({ message: "Sin permiso" }, 403),
    });
    render(<IntegraAccessPage />);

    const avisos = await screen.findAllByRole("alert");
    // Un solo aviso: antes salían `setError` y `toast.error` con el mismo texto.
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toHaveTextContent("No tienes permiso");
    expect(avisos[0]).toHaveAttribute("data-tone", "warn");
  });

  it("el servidor caído no se confunde con la falta de permiso", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    render(<IntegraAccessPage />);

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("El servidor no responde");
    expect(aviso).toHaveAttribute("data-tone", "danger");
    expect(screen.getByRole("button", { name: "Reintentar la carga" })).toBeEnabled();
  });
});

describe("Accesos · los filtros viajan en la URL", () => {
  it("arranca con lo que traiga la URL, no con todo", async () => {
    parametros = new URLSearchParams("estado=remain_open");
    await consolaCon(57);

    // Solo la primera puerta está en `remain_open`.
    expect(screen.getByRole("status")).toHaveTextContent("Mostrando 1 de 1 puertas");
    expect(screen.getByRole("status")).toHaveTextContent("57 cargadas sin filtro");
  });

  it("cambiar un filtro lo devuelve a la URL para poder compartirlo", async () => {
    const user = userEvent.setup();
    await consolaCon(6);

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Estado/ }),
      "remain_open",
    );

    await waitFor(() => expect(reemplazar).toHaveBeenCalled());
    const url = String(reemplazar.mock.calls.at(-1)?.[0] ?? "");
    expect(url).toContain("estado=remain_open");
  });
});

describe("Accesos · nada clicable sin nombre", () => {
  it("los botones de icono de cada puerta dicen qué hacen y sobre cuál", async () => {
    await consolaCon(2);

    expect(screen.getByRole("button", { name: "Abrir Puerta 01 (momentáneo)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar Puerta 01" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Más acciones para Puerta 01" }),
    ).toBeInTheDocument();
  });

  it("seleccionar una puerta es un botón con estado, no un div con onClick", async () => {
    const user = userEvent.setup();
    await consolaCon(2);

    const tarjeta = screen.getByRole("button", { name: /^Puerta 01 · .* ver detalle$/ });
    expect(tarjeta).toHaveAttribute("aria-pressed", "false");

    await user.click(tarjeta);
    expect(tarjeta).toHaveAttribute("aria-pressed", "true");
  });
});
