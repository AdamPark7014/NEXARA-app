import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NuevoProyectoPage from "./page";

/**
 * El asistente manda **un solo POST** con todo el plan, y si el cliente todavía no está activo
 * en operación lo activa antes (la API liga el proyecto al cliente de operación, no al comercial).
 */

const reemplazar = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: reemplazar, push: vi.fn() }),
  usePathname: () => "/erp/proyectos/nuevo",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, nombre: "Ada Lovelace" }, token: "jwt" }),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Llamada = { url: string; method: string; body: unknown };

function servidor() {
  const llamadas: Llamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const l = {
        url: String(input),
        method: (init?.method ?? "GET").toUpperCase(),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      };
      llamadas.push(l);
      if (l.url.includes("ventas/clientes/21/provision-service-client")) {
        return json({ salesClient: { id: 21 }, serviceClient: { id: 321, name: "Hotel Centro" }, created: true });
      }
      if (l.url.includes("ventas/clientes")) {
        return json([
          { id: 20, name: "Plaza Norte", serviceClientId: 320 },
          { id: 21, name: "Hotel Centro", serviceClientId: null },
        ]);
      }
      if (l.url.includes("cotizaciones/core")) return json([]);
      if (l.url.includes("users/assignable")) return json([{ id: 9, nombre: "Beto Ruiz" }]);
      if (l.method === "POST" && /\/proyectos$/.test(l.url)) return json({ id: 77 });
      return json({ message: "no esperado" }, 500);
    }),
  );
  return llamadas;
}

describe("asistente de nuevo proyecto", () => {
  beforeEach(() => reemplazar.mockReset());

  it("no deja avanzar sin nombre ni cliente, y lo dice", async () => {
    const llamadas = servidor();
    const user = userEvent.setup();
    render(<NuevoProyectoPage />);

    await user.click(screen.getByRole("button", { name: "Siguiente →" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Escribe el nombre del proyecto");
    expect(alerta).toHaveTextContent("Elige el cliente.");
    expect(screen.getByRole("heading", { name: /Paso 1 de 7/ })).toBeInTheDocument();
    expect(llamadas.some((l) => l.method === "POST")).toBe(false);
  });

  it("crea el proyecto completo en un POST y activa antes al cliente si hace falta", async () => {
    const llamadas = servidor();
    const user = userEvent.setup();
    render(<NuevoProyectoPage />);

    await user.type(screen.getByLabelText(/Nombre del proyecto/), "CCTV Hotel Centro");
    await waitFor(() => expect(screen.getByRole("option", { name: "Hotel Centro" })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Cliente"), "21");
    await user.click(screen.getByRole("button", { name: "Siguiente →" }));

    // Fechas: el responsable ya viene con quien crea.
    expect(await screen.findByRole("heading", { name: /Paso 2 de 7/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Responsable del proyecto/)).toHaveValue("1");
    await user.type(screen.getByLabelText("Presupuesto autorizado"), "120,000");
    await user.click(screen.getByRole("button", { name: "Siguiente →" }));

    // Cronograma: etapas típicas repartidas.
    await user.click(await screen.findByRole("button", { name: "Usar etapas típicas" }));
    expect(screen.getByDisplayValue("Levantamiento en sitio")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ir a revisar" }));
    await user.click(await screen.findByRole("button", { name: "Crear proyecto" }));

    await waitFor(() => expect(reemplazar).toHaveBeenCalledWith("/erp/proyectos/77"));
    const provision = llamadas.findIndex((l) => l.url.includes("provision-service-client"));
    const alta = llamadas.findIndex((l) => l.method === "POST" && /\/proyectos$/.test(l.url));
    expect(provision).toBeGreaterThanOrEqual(0);
    expect(alta).toBeGreaterThan(provision);
    expect(llamadas.filter((l) => /\/proyectos$/.test(l.url))).toHaveLength(1);
    const cuerpo = llamadas[alta].body as Record<string, unknown>;
    expect(cuerpo).toMatchObject({
      title: "CCTV Hotel Centro",
      clientId: 321,
      responsableId: 1,
      budgetAmount: 120000,
      currency: "MXN",
    });
    expect((cuerpo.milestones as unknown[]).length).toBe(5);
  });
});
