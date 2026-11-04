import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QueSigue from "./QueSigue";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const api = vi.hoisted(() => ({
  fetchQueSigue: vi.fn(),
  fetchPendientes: vi.fn(),
  empezarSugerencia: vi.fn(),
  empezarPendiente: vi.fn(),
  agregarPendiente: vi.fn(),
  palomearPendiente: vi.fn(),
  borrarPendiente: vi.fn(),
}));
vi.mock("@/lib/que-sigue-api", () => api);

const SUGERENCIAS = {
  aplica: true,
  area: "comercial",
  resumen: "También tienes 9 cotizaciones que vencen esta semana, por $234,080.",
  sugerencias: [
    { clave: "abierta:9", tipo: "abierta", titulo: "Retomar AN-0412", detalle: "Cableado", accion: "abrir", href: "/erp/actividades/9" },
    { clave: "cotizacion:70", tipo: "cotizacion", titulo: "Seguir cotización de Grupo Villagrana", detalle: "$27,685 · vence el 05-11", accion: "empezar", href: null },
  ],
};

describe("¿Qué sigue?", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchQueSigue.mockResolvedValue(SUGERENCIAS);
    api.fetchPendientes.mockResolvedValue({ pendientes: [{ id: 1, texto: "Pedir la fianza", createdAt: "2026-11-04T10:00:00Z" }] });
  });

  it("enseña lo que sigue, con su liga o su botón, y el resumen", async () => {
    render(<QueSigue token="t" />);
    expect(await screen.findByText("Seguir cotización de Grupo Villagrana")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir" })).toHaveAttribute("href", "/erp/actividades/9");
    expect(screen.getByText(/9 cotizaciones que vencen/)).toBeInTheDocument();
    expect(screen.getByText("Pedir la fianza")).toBeInTheDocument();
  });

  it("«Empezar» manda solo la clave y abre la actividad que nació", async () => {
    api.empezarSugerencia.mockResolvedValue({ activityId: 77, iniciada: true });
    render(<QueSigue token="t" />);
    await userEvent.click(await screen.findByRole("button", { name: "Empezar" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/erp/actividades/77"));
    expect(api.empezarSugerencia).toHaveBeenCalledWith("t", "cotizacion:70");
  });

  it("si ya no está, lo dice y vuelve a pedir la lista", async () => {
    api.empezarSugerencia.mockRejectedValue(new Error("Esa sugerencia ya no está. Te enseñamos las de ahora."));
    render(<QueSigue token="t" />);
    await userEvent.click(await screen.findByRole("button", { name: "Empezar" }));
    expect(await screen.findByText(/ya no está/)).toBeInTheDocument();
    expect(api.fetchQueSigue).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();
  });

  it("agrega un pendiente, lo palomea y lo vuelve actividad", async () => {
    api.agregarPendiente.mockResolvedValue({ id: 2, texto: "Llamar a Nissan" });
    api.empezarPendiente.mockResolvedValue({ activityId: 80, iniciada: true });
    render(<QueSigue token="t" />);
    await screen.findByText("Pedir la fianza");
    await userEvent.type(screen.getByLabelText("Nuevo pendiente"), "Llamar a Nissan");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));
    await waitFor(() => expect(api.agregarPendiente).toHaveBeenCalledWith("t", "Llamar a Nissan"));
    await waitFor(() => expect(screen.getByLabelText("Nuevo pendiente")).toHaveValue(""));

    await userEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(api.palomearPendiente).toHaveBeenCalledWith("t", 1));

    await waitFor(() => expect(screen.getByRole("button", { name: "Hacerla actividad" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Hacerla actividad" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/erp/actividades/80"));
  });

  it("a dirección no le pinta nada", async () => {
    api.fetchQueSigue.mockResolvedValue({ aplica: false, area: null, sugerencias: [], resumen: null });
    const { container } = render(<QueSigue token="t" />);
    await waitFor(() => expect(api.fetchPendientes).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
