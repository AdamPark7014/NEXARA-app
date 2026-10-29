import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EntityCards, { limpiarCacheTarjetas } from "./EntityCards";
import { refsDelMensaje } from "@/lib/ligas";
import type { TarjetaLiga } from "@/lib/ligas";

/** `fetch` falso de `POST chat/ligas`: responde con las tarjetas que se le den por ref. */
function simularLigas(tarjetas: Record<string, Partial<TarjetaLiga>>, status = 200) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const refs: string[] = JSON.parse(String(init?.body ?? "{}")).refs ?? [];
    const body = Object.fromEntries(refs.filter((r) => tarjetas[r]).map((r) => [r, { ref: r, ...tarjetas[r] }]));
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const base = { detalle: [], monto: null, estado: null, folio: null, acceso: true };

beforeEach(() => {
  limpiarCacheTarjetas();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("refsDelMensaje", () => {
  it("la pastilla gana sobre el mismo folio suelto y los folios sueltos se piden por folio", () => {
    const refs = refsDelMensaje("Listo [AN-0015 · Cableado](/erp/actividades/20) y la AN-0031, también AN-0015");
    expect(refs.map((r) => r.ref)).toEqual(["/erp/actividades/20", "folio:AN-0031"]);
  });

  it("reconoce todos los tipos por su ruta y deja fuera los enlaces que no son ligas", () => {
    const refs = refsDelMensaje(
      "[NEX-LJ75100126-0007](/erp/cotizaciones/7) [Asistencia · Raúl · 29 oct](/erp/asistencias/indicadores/3?desde=2026-10-29&hasta=2026-10-29) [Manual](/erp/kb) [Factura A-12](/erp/invoicing/9)",
      5,
    );
    expect(refs.map((r) => r.tipo)).toEqual(["cotizacion", "asistencia", "factura"]);
  });
});

describe("EntityCards", () => {
  it("una actividad ligada se ve con estado, detalle y «Abrir»", async () => {
    const fetchMock = simularLigas({
      "/erp/actividades/20": {
        ...base,
        tipo: "actividad",
        folio: "AN-0015",
        titulo: "Cableado piso 2",
        estado: "En Proceso",
        detalle: ["Laura Méndez", "Prioridad alta"],
        href: "/erp/actividades/20",
      },
    });
    render(<EntityCards token="tkn" body="Listo [AN-0015 · Cableado piso 2](/erp/actividades/20)" />);

    expect(await screen.findByText("Cableado piso 2")).toBeInTheDocument();
    expect(screen.getByText("Laura Méndez")).toBeInTheDocument();
    expect(screen.getByText("En Proceso")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir actividad AN-0015" })).toHaveAttribute("href", "/erp/actividades/20");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("chat/ligas");
  });

  it("sin acceso queda compacta, con el título genérico y sin datos", async () => {
    simularLigas({
      "/erp/cotizaciones/7": {
        ...base,
        tipo: "cotizacion",
        acceso: false,
        folio: "NEX-LJ75100126-0007",
        titulo: "Cotización NEX-LJ75100126-0007",
        href: "/erp/cotizaciones/7",
        motivo: "Sin acceso",
      },
    });
    render(<EntityCards token="tkn" body="Va la [NEX-LJ75100126-0007](/erp/cotizaciones/7)" />);

    expect(await screen.findByText("Sin acceso")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir cotización NEX-LJ75100126-0007" })).toHaveAttribute(
      "href",
      "/erp/cotizaciones/7",
    );
  });

  it("cotización con monto en pesos", async () => {
    simularLigas({
      "folio:NEX-LJ75100126-0007-JA.CE-R2": {
        ...base,
        tipo: "cotizacion",
        folio: "NEX-LJ75100126-0007-JA.CE-R2",
        titulo: "CCTV bodega norte",
        estado: "Enviada",
        detalle: ["ACME Logística"],
        monto: { total: 12500, moneda: "MXN" },
        href: "/erp/cotizaciones/7",
      },
    });
    render(<EntityCards token="tkn" body="Va la NEX-LJ75100126-0007-JA.CE-R2" />);

    expect(await screen.findByText("CCTV bodega norte")).toBeInTheDocument();
    expect(screen.getByText("ACME Logística")).toBeInTheDocument();
    expect(screen.getByText(/12,500\.00/)).toBeInTheDocument();
  });

  it("varias tarjetas en pantalla salen en una sola llamada", async () => {
    const fetchMock = simularLigas({
      "/erp/actividades/1": { ...base, tipo: "actividad", titulo: "Uno", href: "/erp/actividades/1" },
      "/erp/actividades/2": { ...base, tipo: "actividad", titulo: "Dos", href: "/erp/actividades/2" },
    });
    render(
      <>
        <EntityCards token="tkn" body="[AN-0001 · Uno](/erp/actividades/1)" />
        <EntityCards token="tkn" body="[AN-0002 · Dos](/erp/actividades/2)" />
      </>,
    );
    expect(await screen.findByText("Uno")).toBeInTheDocument();
    expect(await screen.findByText("Dos")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("si el API falla queda compacta con enlace y no se cachea", async () => {
    simularLigas({}, 500);
    render(<EntityCards token="tkn" body="AN-0999" />);
    expect(await screen.findByText("No se pudo cargar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir actividad/ })).toHaveAttribute("href", "/erp/actividades");
  });

  it("no pinta nada si el mensaje no trae ligas", () => {
    const fetchMock = simularLigas({});
    const { container } = render(<EntityCards token="tkn" body="Buenos días equipo" />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
