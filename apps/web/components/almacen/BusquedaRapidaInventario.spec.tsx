import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BusquedaRapidaInventario from "./BusquedaRapidaInventario";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/erp/almacen",
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, nombre: "Iván", token: "jwt", permissions: ["stock.view"] } }),
}));

const CINCHO = {
  origen: "articulo",
  id: 3,
  tipo: "CONSUMIBLE",
  nombre: "Cincho negro 20 cm",
  detalle: "CIN-20",
  codigo: "CIN-20",
  codigoBarras: "7501234567890",
  imagenUrl: null,
  estado: null,
  existencia: { cantidad: 340, unidad: "pz", texto: "3 botes + 40 pz (340 pz)", bajoMinimo: false },
  ubicacion: "Bodega A-2",
  href: "/erp/almacen/otro?producto=3",
};

const TALADRO = {
  origen: "herramienta",
  id: 7,
  tipo: "HERRAMIENTA",
  nombre: "Taladro DeWalt",
  detalle: "DCD771",
  codigo: "HER-0007",
  codigoBarras: null,
  imagenUrl: null,
  estado: { texto: "2 disponibles · 1 prestada", tono: "success" },
  existencia: null,
  ubicacion: null,
  piezas: [{ id: 8, codigo: "HER-0008", estado: "ASSIGNED", quienLaTiene: "Juan Pérez" }],
  href: "/erp/almacen/herramientas?herramienta=7",
};

const CONTEOS = { TODOS: 2, HERRAMIENTA: 1, EQUIPO: 0, CONSUMIBLE: 1, MEDIDA: 0, SIN_TIPO: 0 };

function responder(cuerpo: (url: URL) => { status?: number; body: unknown }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const { status = 200, body } = cuerpo(url);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("búsqueda rápida de inventario", () => {
  it("busca al escribir y pinta tipo, existencia con empaque y ubicación", async () => {
    const fetchMock = responder((url) => ({
      body: {
        q: url.searchParams.get("q"),
        incluyeAlmacen: true,
        conteos: CONTEOS,
        resultados: url.searchParams.get("q") ? [CINCHO, TALADRO] : [],
      },
    }));
    render(<BusquedaRapidaInventario />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar en el inventario" }), "cin");

    expect(await screen.findByText("Cincho negro 20 cm")).toBeInTheDocument();
    expect(screen.getByText("3 botes + 40 pz (340 pz)")).toBeInTheDocument();
    expect(screen.getByText("Bodega A-2")).toBeInTheDocument();
    expect(screen.getByText("2 disponibles · 1 prestada")).toHaveAttribute("data-tono", "success");
    expect(screen.getByText("DCD771 · Con Juan Pérez")).toBeInTheDocument();

    const chips = screen.getAllByRole("button", { pressed: false }).map((b) => b.textContent);
    expect(chips).toEqual(["Herramientas1", "Equipo0", "Consumibles1", "Por medida0"]);
    expect(screen.getByRole("button", { pressed: true })).toHaveTextContent("Todos2");

    const ultima = new URL(String(fetchMock.mock.calls.at(-1)?.[0]), "http://localhost");
    expect(ultima.pathname).toMatch(/tool-requests\/busqueda-rapida$/);
    expect(ultima.searchParams.get("q")).toBe("cin");
    expect(ultima.searchParams.get("tipo")).toBe("TODOS");
  });

  it("con la caja vacía no enseña lista; un chip la abre con ese tipo", async () => {
    const fetchMock = responder((url) => ({
      body: { q: "", incluyeAlmacen: true, conteos: CONTEOS, resultados: url.searchParams.get("tipo") === "CONSUMIBLE" ? [CINCHO] : [] },
    }));
    render(<BusquedaRapidaInventario />);
    const chip = await screen.findByRole("button", { name: /Consumibles/ });
    expect(screen.queryByText("Cincho negro 20 cm")).not.toBeInTheDocument();

    await userEvent.click(chip);
    expect(await screen.findByText("Cincho negro 20 cm")).toBeInTheDocument();
    const ultima = new URL(String(fetchMock.mock.calls.at(-1)?.[0]), "http://localhost");
    expect(ultima.searchParams.get("tipo")).toBe("CONSUMIBLE");
  });

  it("sin acceso al almacén no pinta los chips", async () => {
    const fetchMock = responder(() => ({ body: { q: "tal", incluyeAlmacen: false, conteos: CONTEOS, resultados: [TALADRO] } }));
    render(<BusquedaRapidaInventario tipoInicial="HERRAMIENTA" />);
    await userEvent.type(screen.getByRole("searchbox"), "tal");
    expect(await screen.findByText("Taladro DeWalt")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Tipo de artículo" })).not.toBeInTheDocument();
    const ultima = new URL(String(fetchMock.mock.calls.at(-1)?.[0]), "http://localhost");
    expect(ultima.searchParams.get("tipo")).toBe("HERRAMIENTA");
  });

  it("Enter con un código exacto abre ese resultado (lector de códigos)", async () => {
    responder((url) => ({
      body: {
        q: url.searchParams.get("q"),
        incluyeAlmacen: true,
        conteos: CONTEOS,
        resultados: url.searchParams.get("q") ? [TALADRO, CINCHO] : [],
      },
    }));
    render(<BusquedaRapidaInventario />);
    await userEvent.type(screen.getByRole("searchbox"), "7501234567890{Enter}");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/erp/almacen/otro?producto=3"));
  });

  it("la página puede abrir el resultado por su cuenta", async () => {
    responder((url) => ({
      body: { q: url.searchParams.get("q"), incluyeAlmacen: true, conteos: CONTEOS, resultados: url.searchParams.get("q") ? [TALADRO] : [] },
    }));
    const onAbrir = vi.fn(() => true);
    render(<BusquedaRapidaInventario onAbrir={onAbrir} />);
    await userEvent.type(screen.getByRole("searchbox"), "taladro");
    await userEvent.click(await screen.findByRole("link", { name: /Taladro DeWalt/ }));
    expect(onAbrir).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      "/erp/almacen/herramientas?herramienta=7&q=Taladro+DeWalt",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("sin coincidencias lo dice", async () => {
    responder(() => ({ body: { q: "xyz", incluyeAlmacen: true, conteos: CONTEOS, resultados: [] } }));
    render(<BusquedaRapidaInventario />);
    await userEvent.type(screen.getByRole("searchbox"), "xyz");
    expect(await screen.findByText("Sin resultados para “xyz”")).toBeInTheDocument();
  });

  it("si el servidor aún no tiene la búsqueda, avisa sin romper", async () => {
    responder(() => ({ status: 404, body: { message: "Cannot GET /api/tool-requests/busqueda-rapida", statusCode: 404 } }));
    render(<BusquedaRapidaInventario />);
    expect(await screen.findByText(/todavía no está disponible/)).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("sin permiso no se pinta", async () => {
    responder(() => ({ status: 403, body: { message: "Forbidden resource", statusCode: 403 } }));
    const { container } = render(<BusquedaRapidaInventario />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
