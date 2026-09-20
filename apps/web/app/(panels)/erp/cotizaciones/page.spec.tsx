import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import CotizacionesPage from "./page";

/** La lista: el folio se lee (de quién, qué número, quién intervino, revisión) y se filtra por segmento y estado. */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/erp/cotizaciones",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, nombre: "Luis Joel Aguilar" }, token: "jwt" }),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const LUIS = { id: 1, nombre: "Luis Joel Aguilar", clave: "LJ75100126", siglas: "LJ" };

const FILAS = [
  {
    id: 7,
    folio: "NEX-LJ75100126-0007-JA.CE-R2",
    conNomenclatura: true,
    necesitaRefolio: false,
    clienteNombre: "Plaza Norte",
    projectName: "Renovación del CCTV",
    segmento: "OBRA",
    segmentoEtiqueta: "Obra",
    estado: "ENVIADA",
    estadoEtiqueta: "Enviada",
    total: 89180.7,
    currency: "MXN",
    issueDate: "2026-09-10T00:00:00.000Z",
    sentAt: "2026-09-12T00:00:00.000Z",
    revision: 2,
    elaboro: LUIS,
    intervinieron: [
      { userId: 1, nombre: "Luis Joel Aguilar", siglas: "LJ", rol: "ELABORO" },
      { userId: 2, nombre: "Jorge Alberto Méndez", siglas: "JA", rol: "REVISO" },
      { userId: 3, nombre: "Christian Eduardo Del Pozo", siglas: "CE", rol: "ENVIO" },
    ],
  },
  {
    id: 3,
    folio: "NXR-2026-763366",
    conNomenclatura: false,
    necesitaRefolio: true,
    clienteNombre: "Hotel Centro",
    segmento: "COMERCIAL",
    segmentoEtiqueta: "Comercial",
    estado: "BORRADOR",
    estadoEtiqueta: "Borrador",
    total: 1200,
    issueDate: "2026-08-01T00:00:00.000Z",
    revision: 1,
    elaboro: { id: 4, nombre: "Ana Karen Ruiz", clave: "AK92030000", siglas: "AK" },
    intervinieron: [],
  },
];

describe("lista de cotizaciones", () => {
  it("cada fila explica su folio y dice quién intervino", async () => {
    const fetchMock = vi.fn(async () => json(FILAS));
    vi.stubGlobal("fetch", fetchMock);
    render(<CotizacionesPage />);

    const fila = (await screen.findByText("Plaza Norte")).closest("a")!;
    expect(String(fetchMock.mock.calls[0]![0])).toContain("cotizaciones/core");
    expect(fila).toHaveAttribute("href", "/erp/cotizaciones/7");
    expect(within(fila).getByText("Luis Joel Aguilar · su #7 · revisión 2")).toBeInTheDocument();
    expect(within(fila).getByText("JA")).toHaveAttribute("title", "Jorge Alberto Méndez · Revisó");
    expect(within(fila).getByText("CE")).toBeInTheDocument();
    expect(within(fila).getByText("Renovación del CCTV")).toBeInTheDocument();
  });

  it("el borrador viejo se marca y muestra al menos a quien lo hizo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(FILAS)));
    render(<CotizacionesPage />);
    const fila = (await screen.findByText("Hotel Centro")).closest("a")!;
    expect(within(fila).getByText("Sin nomenclatura")).toBeInTheDocument();
    expect(within(fila).getByText("AK")).toHaveAttribute("title", expect.stringContaining("Ana Karen Ruiz"));
    expect(screen.getByText(/1 borrador con folio viejo/)).toBeInTheDocument();
  });

  it("la explicación del folio vive en la ⓘ y usa una cotización real", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(FILAS)));
    const user = userEvent.setup();
    render(<CotizacionesPage />);
    await screen.findByText("Plaza Norte");
    // La página no lleva el texto: solo el icono.
    expect(
      screen.queryByText("Luis Joel Aguilar (LJ75100126) · su cotización #7 · intervinieron JA, CE · revisión 2"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "¿Cómo se lee un folio?" }));
    expect(
      screen.getByText("Luis Joel Aguilar (LJ75100126) · su cotización #7 · intervinieron JA, CE · revisión 2"),
    ).toBeInTheDocument();
  });

  it("filtra por segmento y por estado, con conteos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(FILAS)));
    const user = userEvent.setup();
    render(<CotizacionesPage />);
    await screen.findByText("Plaza Norte");

    const segmentos = screen.getByRole("group", { name: "Filtrar por segmento" });
    await user.click(within(segmentos).getByRole("button", { name: /Comercial/ }));
    expect(screen.queryByText("Plaza Norte")).not.toBeInTheDocument();
    expect(screen.getByText("Hotel Centro")).toBeInTheDocument();

    await user.click(within(segmentos).getByRole("button", { name: /Todos/ }));
    const estados = screen.getByRole("group", { name: "Filtrar por estado" });
    await user.click(within(estados).getByRole("button", { name: /Enviada/ }));
    expect(screen.getByText("Plaza Norte")).toBeInTheDocument();
    expect(screen.queryByText("Hotel Centro")).not.toBeInTheDocument();
  });

  it("busca también por quién intervino", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(FILAS)));
    const user = userEvent.setup();
    render(<CotizacionesPage />);
    await screen.findByText("Plaza Norte");
    await user.type(screen.getByLabelText("Buscar cotizaciones"), "christian");
    expect(screen.getByText("Plaza Norte")).toBeInTheDocument();
    expect(screen.queryByText("Hotel Centro")).not.toBeInTheDocument();
  });

  it("sin cotizaciones enseña qué es y cómo empezar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([])));
    render(<CotizacionesPage />);
    expect(await screen.findByText("Todavía no hay cotizaciones")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear la primera" })).toHaveAttribute("href", "/erp/cotizaciones/nueva");
  });
});
