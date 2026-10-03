import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EntityCards, { limpiarCacheTarjetas } from "./EntityCards";

type Ruta = { match: string; status?: number; body: unknown };

/** `fetch` falso: responde según el primer fragmento de ruta que coincida. */
function simularApi(rutas: Ruta[]) {
  const fetchMock = vi.fn(async (url: string) => {
    const ruta = rutas.find((r) => String(url).includes(r.match));
    const status = ruta ? ruta.status ?? 200 : 404;
    const texto = ruta ? JSON.stringify(ruta.body) : "no encontrado";
    return { ok: status >= 200 && status < 300, status, text: async () => texto } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const llamadas = (fetchMock: ReturnType<typeof simularApi>) => fetchMock.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  limpiarCacheTarjetas();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EntityCards · actividades", () => {
  it("con la pastilla del selector va directo al detalle por id", async () => {
    const fetchMock = simularApi([
      {
        match: "activities/20",
        body: {
          id: 20,
          anNumber: "AN-0015",
          titulo: "Cableado piso 2",
          estatus: "En Proceso",
          prioridad: "ALTA",
          responsable: { nombre: "Laura Méndez" },
          fechaMaxima: "2026-10-03T18:00:00.000Z",
        },
      },
    ]);
    render(<EntityCards token="tkn" body="Listo [AN-0015 · Cableado piso 2](/erp/actividades/20)" />);

    expect(await screen.findByText("Cableado piso 2")).toBeInTheDocument();
    expect(screen.getByText("Laura Méndez")).toBeInTheDocument();
    expect(screen.getByText("Prioridad alta")).toBeInTheDocument();
    expect(screen.getByText("En Proceso")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir actividad AN-0015" })).toHaveAttribute(
      "href",
      "/erp/actividades/20",
    );
    expect(llamadas(fetchMock).some((u) => u.includes("chat/mentions"))).toBe(false);
  });

  it("con el folio suelto lo busca en las menciones del chat y cae a esos datos si no hay detalle", async () => {
    simularApi([
      {
        match: "chat/mentions",
        body: [{ kind: "ACTIVITY", id: 31, label: "AN-0031 · Instalar cámaras", subtitle: "Por Validar" }],
      },
      { match: "activities/31", status: 403, body: { message: "Forbidden" } },
    ]);
    render(<EntityCards token="tkn" body="¿Cómo va la AN-0031?" />);

    expect(await screen.findByText("Instalar cámaras")).toBeInTheDocument();
    expect(screen.getByText("Por Validar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir actividad AN-0031" })).toHaveAttribute(
      "href",
      "/erp/actividades/31",
    );
  });

  it("si el folio no aparece queda compacta, con folio y enlace a la lista", async () => {
    simularApi([{ match: "chat/mentions", body: [] }]);
    render(<EntityCards token="tkn" body="AN-0999" />);

    expect(await screen.findByText("No aparece en tus actividades")).toBeInTheDocument();
    expect(screen.getByText("AN-0999")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir actividad AN-0999" })).toHaveAttribute("href", "/erp/actividades");
  });
});

describe("EntityCards · cotizaciones", () => {
  it("resuelve la cotización con la lista core y enlaza a su detalle", async () => {
    const fetchMock = simularApi([
      {
        match: "cotizaciones/core",
        body: [
          {
            id: 7,
            folio: "NEX-LJ75100126-0007-JA.CE-R2",
            projectName: "CCTV bodega norte",
            clienteEmpresa: "ACME Logística",
            estadoEtiqueta: "Enviada",
            total: 12500,
            currency: "MXN",
            elaboro: { nombre: "Luis Pérez" },
          },
        ],
      },
    ]);
    render(<EntityCards token="tkn" body="Va la NEX-LJ75100126-0007-JA.CE-R2" />);

    expect(await screen.findByText("CCTV bodega norte")).toBeInTheDocument();
    expect(screen.getByText("ACME Logística")).toBeInTheDocument();
    expect(screen.getByText("Enviada")).toBeInTheDocument();
    expect(screen.getByText("Elaboró Luis Pérez")).toBeInTheDocument();
    expect(screen.getByText(/12,500\.00/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir cotización NEX-LJ75100126-0007-JA.CE-R2" })).toHaveAttribute(
      "href",
      "/erp/cotizaciones/7",
    );
    expect(llamadas(fetchMock)[0]).toContain(`search=${encodeURIComponent("NEX-LJ75100126-0007-JA.CE-R2")}`);
  });

  it("sin permiso de cotizaciones muestra la tarjeta compacta", async () => {
    simularApi([{ match: "cotizaciones/core", status: 403, body: { message: "Forbidden" } }]);
    render(<EntityCards token="tkn" body="NXR-2026-763366" />);

    expect(await screen.findByText("Sin acceso a cotizaciones")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir cotización NXR-2026-763366" })).toHaveAttribute(
      "href",
      "/erp/cotizaciones",
    );
  });

  it("no pinta nada si el mensaje no trae folios", () => {
    const fetchMock = simularApi([]);
    const { container } = render(<EntityCards token="tkn" body="Buenos días equipo" />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
