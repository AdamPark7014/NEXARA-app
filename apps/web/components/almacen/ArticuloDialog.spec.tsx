import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ArticuloDialog, { ALTA_HERRAMIENTA_HREF } from "./ArticuloDialog";

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, nombre: "Iván", token: "jwt", permissions: ["catalog.manage"] } }),
}));

const { avisos } = vi.hoisted(() => ({ avisos: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/Toast", () => ({ toast: avisos }));

function stubFetch(respuesta: (url: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    new Response(JSON.stringify(respuesta(String(input), init)), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("alta de artículo", () => {
  it("el tipo es obligatorio", async () => {
    const fetchMock = stubFetch(() => ({}));
    render(<ArticuloDialog open onClose={vi.fn()} onGuardado={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox", { name: /Nombre/ }), "Cincho negro 20 cm");
    await userEvent.click(screen.getByRole("button", { name: "Dar de alta" }));
    expect(await screen.findByText("Elige el tipo de artículo.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("consumible: pide empaque y cuántas trae, enseña la equivalencia y lo manda a la API", async () => {
    const fetchMock = stubFetch(() => ({ id: 9, sku: "SKU-0009", name: "Cincho negro 20 cm", tipoArticulo: "CONSUMIBLE" }));
    const onGuardado = vi.fn();
    render(<ArticuloDialog open onClose={vi.fn()} onGuardado={onGuardado} />);

    await userEvent.click(screen.getByRole("radio", { name: "Consumible" }));
    await userEvent.type(screen.getByRole("textbox", { name: /Nombre/ }), "Cincho negro 20 cm");
    await userEvent.type(screen.getByRole("combobox", { name: /Empaque/ }), "Bote");
    await userEvent.type(screen.getByRole("textbox", { name: /Trae/ }), "100");
    expect(screen.getByText("1 bote = 100 pz")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Dar de alta" }));
    await waitFor(() => expect(onGuardado).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }), "alta"));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/catalog\/products$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      name: "Cincho negro 20 cm",
      tipoArticulo: "CONSUMIBLE",
      unitName: "pz",
      empaque: { nombre: "Bote", capacidad: 100 },
    });
    expect(avisos.success).toHaveBeenCalled();
  });

  it("por medida pide presentación y metros", async () => {
    stubFetch(() => ({}));
    render(<ArticuloDialog open onClose={vi.fn()} onGuardado={vi.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: "Por medida" }));
    await userEvent.type(screen.getByRole("combobox", { name: /Presentación/ }), "Bobina");
    await userEvent.type(screen.getByRole("textbox", { name: /Trae/ }), "305");
    expect(screen.getByText("1 bobina = 305 m")).toBeInTheDocument();
  });

  it("equipo no lleva empaque", async () => {
    stubFetch(() => ({}));
    render(<ArticuloDialog open onClose={vi.fn()} onGuardado={vi.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: "Equipo" }));
    expect(screen.queryByRole("textbox", { name: /Trae/ })).not.toBeInTheDocument();
    expect(screen.getByText("Se cuenta por pieza y no lleva empaque.")).toBeInTheDocument();
  });

  it("herramienta no crea producto: lleva a Nueva herramienta", async () => {
    const fetchMock = stubFetch(() => ({}));
    render(<ArticuloDialog open onClose={vi.fn()} onGuardado={vi.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: "Herramienta" }));
    expect(screen.getByRole("link", { name: "Ir a Nueva herramienta" })).toHaveAttribute("href", ALTA_HERRAMIENTA_HREF);
    expect(screen.queryByRole("button", { name: "Dar de alta" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si el servidor aún no guarda el tipo, lo avisa", async () => {
    stubFetch(() => ({ id: 3, sku: "SKU-0003", name: "Monitor 24 in" }));
    const onGuardado = vi.fn();
    render(<ArticuloDialog open onClose={vi.fn()} onGuardado={onGuardado} />);
    await userEvent.click(screen.getByRole("radio", { name: "Equipo" }));
    await userEvent.type(screen.getByRole("textbox", { name: /Nombre/ }), "Monitor 24 in");
    await userEvent.click(screen.getByRole("button", { name: "Dar de alta" }));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(avisos.warning).toHaveBeenCalledWith(expect.objectContaining({ title: "Artículo dado de alta sin tipo" }));
  });
});

describe("edición de artículo", () => {
  it("llega con su tipo y su empaque, no deja volverlo herramienta y manda PATCH sin SKU", async () => {
    const fetchMock = stubFetch((url) =>
      url.includes("/empaques")
        ? [{ id: 1, productId: 4, nombre: "Bolsa", piezasPorUnidad: "50.0000", codigoBarras: null, esDefaultCompra: true }]
        : { id: 4, sku: "TAQ-14", name: "Taquete 1/4", tipoArticulo: "CONSUMIBLE" },
    );
    const onGuardado = vi.fn();
    render(
      <ArticuloDialog
        open
        onClose={vi.fn()}
        onGuardado={onGuardado}
        producto={{ id: 4, name: "Taquete 1/4", sku: "TAQ-14", category: "Fijación", tipoArticulo: "CONSUMIBLE" }}
      />,
    );
    expect(screen.getByRole("radio", { name: "Herramienta" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Consumible" })).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByDisplayValue("Bolsa")).toBeInTheDocument();
    expect(screen.getByText("1 bolsa = 50 pz")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(onGuardado).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }), "editar"));
    const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH") as [string, RequestInit];
    expect(patch[0]).toMatch(/catalog\/products\/4$/);
    expect(JSON.parse(String(patch[1].body))).toEqual({
      name: "Taquete 1/4",
      category: "Fijación",
      tipoArticulo: "CONSUMIBLE",
      empaque: { nombre: "Bolsa", capacidad: 50 },
    });
  });
});
