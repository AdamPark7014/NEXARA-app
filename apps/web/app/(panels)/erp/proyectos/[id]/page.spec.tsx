import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProyectoDetallePage from "./page";
import { hoyISO } from "@/lib/proyecto-plan";

/**
 * El detalle del proyecto: lo que se fija aquí es lo que hace que el esquema sea serio y no
 * decorativo. Marcar una etapa manda la fecha real de hoy, cancelar exige motivo antes de
 * llamar a la API, y el 403 de alcance de equipo llega a la pantalla con las palabras del servidor.
 */

const reemplazar = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: reemplazar, push: vi.fn() }),
  useParams: () => ({ id: "7" }),
  usePathname: () => "/erp/proyectos/7",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 1, nombre: "Ada Lovelace", email: "ada@nexara.mx" }, token: "jwt" }),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ADA = { id: 1, nombre: "Ada Lovelace", email: "ada@nexara.mx" };

function proyecto(cambios: Record<string, unknown> = {}) {
  return {
    id: 7,
    title: "Videovigilancia Plaza Norte",
    description: "Cámaras en accesos y estacionamiento.",
    objective: "Ver todas las entradas desde la oficina central.",
    scopeSummary: null,
    projectType: "INSTALACION_CCTV",
    siteCount: 2,
    status: "ACTIVE",
    vendorId: 1,
    responsableId: 1,
    clientId: 50,
    startDate: "2026-09-01T00:00:00.000Z",
    endDate: "2026-10-30T00:00:00.000Z",
    actualStartDate: "2026-09-02T00:00:00.000Z",
    actualEndDate: null,
    budgetAmount: 250000,
    currency: "MXN",
    cotizacionId: null,
    cancelReason: null,
    vendor: ADA,
    responsable: ADA,
    client: { id: 50, name: "Plaza Norte", contactEmail: null, contactPhone: null },
    salesProject: null,
    cotizacion: null,
    milestones: [
      {
        id: 11,
        name: "Levantamiento",
        orden: 0,
        plannedDate: "2026-09-10T00:00:00.000Z",
        actualDate: null,
        responsableId: 1,
        responsable: ADA,
        status: "PENDIENTE",
      },
    ],
    scopeItems: [],
    requirements: [],
    members: [{ id: 1, userId: 1, role: "RESPONSABLE", rolEtiqueta: "Responsable", user: ADA }],
    documents: [],
    activities: [],
    resumen: {
      salud: "EN_RIESGO",
      etiqueta: "En riesgo",
      enRiesgo: true,
      diasDeRetraso: 0,
      diasRestantes: 43,
      hitosVencidos: 1,
      motivo: "1 hito del cronograma con la fecha vencida.",
      avance: { total: 0, cerradas: 0, finalizadas: 0, abiertas: 0, porcentaje: 0, origen: "hitos" },
      requerimientos: { total: 0, cumplidos: 0, pendientes: 0, porcentaje: null },
      estadoEtiqueta: "En curso",
    },
    ...cambios,
  };
}

type Llamada = { url: string; method: string; body: unknown };

function servidor(respuestas: Array<(l: Llamada) => Response | undefined>) {
  const llamadas: Llamada[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const llamada = {
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body ?? null,
    };
    llamadas.push(llamada);
    for (const r of respuestas) {
      const res = r(llamada);
      if (res) return res;
    }
    if (llamada.url.includes("users/assignable")) return json([]);
    if (llamada.url.endsWith("proyectos/7") && llamada.method === "GET") return json(proyecto());
    return json({ message: `Sin respuesta de prueba para ${llamada.method} ${llamada.url}` }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return llamadas;
}

describe("detalle del proyecto", () => {
  beforeEach(() => {
    reemplazar.mockReset();
  });

  it("muestra estado, semáforo, avance y las fechas plan contra real", async () => {
    servidor([]);
    render(<ProyectoDetallePage />);

    expect(await screen.findByRole("heading", { name: "Videovigilancia Plaza Norte" })).toBeInTheDocument();
    expect(screen.getAllByText("En curso").length).toBeGreaterThan(0);
    expect(screen.getAllByText("En riesgo").length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: /Resumen/ })).toHaveAttribute("aria-selected", "true");
    const fechas = screen.getByRole("table");
    expect(within(fechas).getByRole("rowheader", { name: "Inicio" })).toBeInTheDocument();
    expect(within(fechas).getByText("Arrancó 1 día tarde")).toBeInTheDocument();
    // Solo las transiciones que la API acepta desde «En curso».
    const acciones = screen.getByRole("group", { name: "Cambiar estado del proyecto" });
    expect(within(acciones).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Poner en pausa",
      "Dar por terminado",
      "Cancelar proyecto",
    ]);
  });

  it("marcar una etapa como cumplida manda la fecha real de hoy y pinta la respuesta", async () => {
    const llamadas = servidor([
      (l) =>
        l.method === "PATCH" && l.url.includes("proyectos/7/hitos/11")
          ? json(
              proyecto({
                milestones: [
                  { ...proyecto().milestones[0], status: "CUMPLIDO", actualDate: `${hoyISO()}T00:00:00.000Z` },
                ],
              }),
            )
          : undefined,
    ]);
    const user = userEvent.setup();
    render(<ProyectoDetallePage />);

    await user.click(await screen.findByRole("tab", { name: /Cronograma/ }));
    await user.click(screen.getByRole("button", { name: "Marcar cumplida" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("«Levantamiento» marcada como cumplida."));
    const patch = llamadas.find((l) => l.method === "PATCH");
    expect(patch?.body).toEqual({ actualDate: hoyISO() });
    expect(screen.getByRole("button", { name: "Desmarcar" })).toBeInTheDocument();
  });

  it("cancelar pide el motivo antes de tocar la API", async () => {
    const llamadas = servidor([
      (l) =>
        l.method === "PATCH" && l.url.includes("proyectos/7/estado")
          ? json(proyecto({ status: "CANCELLED", cancelReason: "El cliente pospuso la obra." }))
          : undefined,
    ]);
    const user = userEvent.setup();
    render(<ProyectoDetallePage />);

    await user.click(await screen.findByRole("button", { name: "Cancelar proyecto" }));
    const panel = screen.getByRole("region", { name: "Cancelar proyecto" });
    await user.click(within(panel).getByRole("button", { name: "Cancelar proyecto" }));
    expect(within(panel).getByRole("alert")).toHaveTextContent("Escribe por qué se cancela");
    expect(llamadas.some((l) => l.method === "PATCH")).toBe(false);

    await user.type(within(panel).getByLabelText(/Por qué se cancela/), "El cliente pospuso la obra.");
    await user.click(within(panel).getByRole("button", { name: "Cancelar proyecto" }));
    await waitFor(() =>
      expect(llamadas.find((l) => l.method === "PATCH")?.body).toEqual({
        status: "CANCELLED",
        cancelReason: "El cliente pospuso la obra.",
      }),
    );
  });

  it("el 403 de alcance de equipo se muestra con las palabras del servidor", async () => {
    servidor([
      (l) =>
        l.url.includes("users/assignable")
          ? json([{ id: 9, nombre: "Beto Ruiz", email: "beto@nexara.mx" }])
          : undefined,
      (l) =>
        l.method === "POST" && l.url.includes("proyectos/7/equipo")
          ? json({ statusCode: 403, message: "Beto Ruiz está fuera de tu equipo: no puedes asignarle este proyecto." }, 403)
          : undefined,
    ]);
    const user = userEvent.setup();
    render(<ProyectoDetallePage />);

    await user.click(await screen.findByRole("tab", { name: /Equipo/ }));
    await waitFor(() => expect(screen.getByRole("option", { name: "Beto Ruiz" })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Persona"), "9");
    await user.click(screen.getByRole("button", { name: "Sumar" }));

    expect(await screen.findByText("Beto Ruiz está fuera de tu equipo: no puedes asignarle este proyecto.")).toBeInTheDocument();
  });
});
