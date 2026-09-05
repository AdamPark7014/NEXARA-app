import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import IntegraAuditPage from "./page";
import { TOPE_SERVIDOR } from "./_bitacora";

/**
 * La bitácora es el único sitio donde queda constancia de quién abrió una
 * puerta a distancia. Estas pruebas fijan lo que la hace utilizable en una
 * investigación: que el detalle salga entero, que un tope se anuncie, y que
 * «no tienes permiso» no se confunda con «el servidor está caído».
 */

const reemplazar = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: reemplazar, push: vi.fn() }),
  usePathname: () => "/integra/audit",
  useSearchParams: () => new URLSearchParams(""),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const MOTIVO_LARGO =
  "El proveedor de limpieza llegó sin gafete y el guardia de turno pidió apertura remota; " +
  "se validó por teléfono con el jefe de piso antes de accionar la puerta de recepción.";

const APERTURA = {
  id: 501,
  action: "integra.door.open",
  entityId: 3,
  createdAt: "2026-09-03T18:12:00.000Z",
  userName: "Ada Lovelace",
  userEmail: "ada@nexara.mx",
  changes: {
    doorIndexCode: "192.168.9.31|1",
    provider: "ISAPI",
    controlType: "2",
    reason: MOTIVO_LARGO,
    email: "ada@nexara.mx",
  },
};

const ALTA_VEHICULO = {
  id: 502,
  action: "integra.vehicle.add",
  entityId: 3,
  createdAt: "2026-09-03T09:00:00.000Z",
  userName: null,
  userEmail: null,
  changes: { plate: "ABC1234", deviceSync: false },
};

function servidorCon(items: unknown[]) {
  const fetchMock = vi.fn(async () => json({ total: items.length, items }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Bitácora · el detalle sale entero", () => {
  beforeEach(() => {
    reemplazar.mockClear();
    window.localStorage.clear();
  });

  it("pide al servidor el máximo que admite, no las 40 por defecto", async () => {
    const fetchMock = servidorCon([APERTURA]);
    render(<IntegraAuditPage />);

    await screen.findByText("Puerta abierta a distancia");
    expect(String(fetchMock.mock.calls[0][0])).toContain(`limit=${TOPE_SERVIDOR}`);
  });

  it("traduce la acción y deja a la vista su código real", async () => {
    servidorCon([APERTURA]);
    render(<IntegraAuditPage />);

    expect(await screen.findByText("Puerta abierta a distancia")).toBeInTheDocument();
    expect(screen.getByText("integra.door.open")).toBeInTheDocument();
  });

  it("la celda de resumen no enseña un JSON cortado a la mitad", async () => {
    servidorCon([APERTURA]);
    render(<IntegraAuditPage />);
    await screen.findByText("Puerta abierta a distancia");

    // Lo que había antes: JSON.stringify(changes).slice(0, 120).
    const recortado = JSON.stringify(APERTURA.changes).slice(0, 120);
    expect(screen.queryByText(recortado)).not.toBeInTheDocument();
    expect(screen.getByText(/Puerta: 192\.168\.9\.31\|1/)).toBeInTheDocument();
  });

  it("al desplegar la fila aparece el motivo completo, no un prefijo", async () => {
    servidorCon([APERTURA]);
    render(<IntegraAuditPage />);
    await screen.findByText("Puerta abierta a distancia");

    const desplegar = screen.getByRole("button", { name: /Ver el detalle de/i });
    expect(desplegar).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(desplegar);

    expect(desplegar).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(MOTIVO_LARGO)).toBeInTheDocument();
    // Y el código de control decodificado con la tabla real de puertas: sale
    // en el resumen de la fila y otra vez en el detalle.
    expect(screen.getAllByText(/Abrir \(momentáneo\) \(2\)/).length).toBeGreaterThanOrEqual(2);
  });

  it("una entrada sin usuario dice que fue un proceso, no un guion", async () => {
    servidorCon([ALTA_VEHICULO]);
    render(<IntegraAuditPage />);

    expect(
      await screen.findByText("Proceso automático (sin usuario)"),
    ).toBeInTheDocument();
  });
});

describe("Bitácora · nada de truncados mudos", () => {
  beforeEach(() => {
    reemplazar.mockClear();
    window.localStorage.clear();
  });

  it("cuando el servidor devuelve el tope, lo dice en pantalla", async () => {
    const muchas = Array.from({ length: TOPE_SERVIDOR }, (_, i) => ({
      ...ALTA_VEHICULO,
      id: 1000 + i,
    }));
    servidorCon(muchas);
    render(<IntegraAuditPage />);

    expect(
      await screen.findByText(/hay bitácora más antigua que esta pantalla no alcanza/i),
    ).toBeInTheDocument();
  });

  it("por debajo del tope explica que filtra el navegador, no el servidor", async () => {
    servidorCon([APERTURA, ALTA_VEHICULO]);
    render(<IntegraAuditPage />);

    expect(
      await screen.findByText(/El filtrado y la paginación de abajo ocurren en el navegador/i),
    ).toBeInTheDocument();
  });

  it("la paginación dice qué tramo se está viendo", async () => {
    const muchas = Array.from({ length: 60 }, (_, i) => ({ ...ALTA_VEHICULO, id: 2000 + i }));
    servidorCon(muchas);
    render(<IntegraAuditPage />);

    const nav = await screen.findByRole("navigation", { name: /Paginación/i });
    expect(within(nav).getByText("1–50 de 60")).toBeInTheDocument();
    expect(within(nav).getByText(/Página 1 de 2/)).toBeInTheDocument();
  });
});

describe("Bitácora · errores que distinguen de quién es el problema", () => {
  beforeEach(() => {
    reemplazar.mockClear();
    window.localStorage.clear();
  });

  it("un 403 dice que es de permisos y NO ofrece reintentar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          {
            statusCode: 403,
            message: "Tu rol (tecnico) no puede acceder a GET /api/integra/audit",
          },
          403,
        ),
      ),
    );
    render(<IntegraAuditPage />);

    expect(await screen.findByText("No tienes permiso")).toBeInTheDocument();
    expect(screen.getByText(/Tu rol \(tecnico\)/)).toBeInTheDocument();
    // Reintentar un 403 solo sirve para perder el tiempo.
    expect(screen.queryByRole("button", { name: /Reintentar/i })).not.toBeInTheDocument();
  });

  it("un servidor caído dice que no responde y sí ofrece reintentar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    render(<IntegraAuditPage />);

    expect(await screen.findByText("El servidor no responde")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
  });

  it("un 500 se distingue del 403 y también deja reintentar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ statusCode: 500, message: "Internal server error" }, 500)),
    );
    render(<IntegraAuditPage />);

    expect(await screen.findByText("El servidor falló")).toBeInTheDocument();
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
  });
});

describe("Bitácora · vacíos que explican y botones que se anuncian", () => {
  beforeEach(() => {
    reemplazar.mockClear();
    window.localStorage.clear();
  });

  it("sin entradas explica qué es esta pantalla y qué NO es", async () => {
    servidorCon([]);
    render(<IntegraAuditPage />);

    expect(await screen.findByText(/La bitácora todavía no tiene nada/i)).toBeInTheDocument();
    expect(screen.getByText(/abrir una puerta a distancia/i)).toBeInTheDocument();
    // Distinguirla de Eventos ACS evita el «aquí no sale nada» de siempre.
    expect(screen.getByText(/eso es Eventos ACS/i)).toBeInTheDocument();
  });

  it("todo botón de solo icono se anuncia a un lector de pantalla", async () => {
    servidorCon([APERTURA]);
    render(<IntegraAuditPage />);
    await screen.findByText("Puerta abierta a distancia");

    for (const nombre of [
      /Exportar a CSV/i,
      /Volver a cargar la bitácora/i,
      /Quitar todos los filtros/i,
      /Primera página/i,
      /Página siguiente/i,
    ]) {
      expect(screen.getByRole("button", { name: nombre })).toBeInTheDocument();
    }
  });

  it("no ofrece exportar un CSV vacío", async () => {
    servidorCon([]);
    render(<IntegraAuditPage />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Exportar a CSV/i })).toBeDisabled(),
    );
  });
});
