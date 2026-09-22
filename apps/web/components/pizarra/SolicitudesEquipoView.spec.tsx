import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SolicitudesEquipoView from "./SolicitudesEquipoView";
import type { PeerRequestItem } from "@/lib/peer-requests-api";

const fetchPeerRequests = vi.hoisted(() => vi.fn());
const fetchPeerCandidates = vi.hoisted(() => vi.fn());
const createPeerRequest = vi.hoisted(() => vi.fn());
const acceptPeerRequest = vi.hoisted(() => vi.fn());
const rejectPeerRequest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/peer-requests-api", () => ({
  fetchPeerRequests,
  fetchPeerCandidates,
  createPeerRequest,
  acceptPeerRequest,
  rejectPeerRequest,
}));

function persona(id: number, nombre: string) {
  return { id, nombre, avatarUrl: null, puesto: "Técnico" };
}

function solicitud(parcial: Partial<PeerRequestItem> & Pick<PeerRequestItem, "id">): PeerRequestItem {
  return {
    title: "Cambiar la cámara 3",
    description: null,
    status: "PENDING",
    rejectReason: null,
    activityId: null,
    createdAt: "2026-09-18T15:00:00.000Z",
    updatedAt: "2026-09-18T15:00:00.000Z",
    fromUser: persona(7, "Ana Ruiz"),
    toUser: persona(9, "Luis Mora"),
    activity: null,
    ...parcial,
  };
}

function montar(datos: { sent?: PeerRequestItem[]; received?: PeerRequestItem[] } = {}) {
  fetchPeerRequests.mockResolvedValue({ sent: datos.sent ?? [], received: datos.received ?? [] });
  fetchPeerCandidates.mockResolvedValue([persona(7, "Ana Ruiz"), persona(9, "Luis Mora")]);
  return render(<SolicitudesEquipoView token="tok" />);
}

describe("SolicitudesEquipoView", () => {
  it("sin recibidas ni enviadas pinta un solo vacío, no dos encabezados", async () => {
    montar();
    expect(await screen.findByText("Todavía no hay solicitudes")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Recibidas/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Enviadas/ })).toBeNull();
  });

  it("el botón no está muerto: dice bajo el campo qué falta y no llama a la API", async () => {
    montar();
    await screen.findByText("Todavía no hay solicitudes");

    await userEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    expect(
      await screen.findByText("Elige al compañero a quien le pides la actividad."),
    ).toBeInTheDocument();
    expect(createPeerRequest).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByLabelText("Para quién"), "7");
    await userEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    expect(await screen.findByText("Escríbelo en tres letras o más.")).toBeInTheDocument();
    expect(createPeerRequest).not.toHaveBeenCalled();
  });

  it("ofrece a todo el personal, no solo a la rama del organigrama", async () => {
    montar();
    await screen.findByText("Todavía no hay solicitudes");

    const selector = screen.getByLabelText("Para quién") as HTMLSelectElement;
    const opciones = Array.from(selector.options).map((o) => o.textContent);
    expect(opciones).toEqual(["Elige a alguien…", "Ana Ruiz · Técnico", "Luis Mora · Técnico"]);
    expect(fetchPeerCandidates).toHaveBeenCalledWith("tok");
    expect(screen.getByText("Cualquier compañero de la empresa.")).toBeInTheDocument();
  });

  it("dice con todas sus letras que es pedirle una actividad a un compañero", async () => {
    montar();
    expect(
      await screen.findByRole("heading", { name: "Pedirle una actividad a un compañero" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/le pides a cualquier compañero de la empresa/i)).toBeInTheDocument();
  });

  it("envía la solicitud y limpia el formulario", async () => {
    montar();
    await screen.findByText("Todavía no hay solicitudes");
    createPeerRequest.mockResolvedValue(solicitud({ id: 1 }));

    await userEvent.selectOptions(screen.getByLabelText("Para quién"), "7");
    await userEvent.type(screen.getByLabelText("¿Qué actividad le pides?"), "  Apoyo en la cámara 3  ");
    await userEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    await waitFor(() =>
      expect(createPeerRequest).toHaveBeenCalledWith("tok", {
        toUserId: 7,
        title: "Apoyo en la cámara 3",
        description: undefined,
      }),
    );
    expect(await screen.findByText("Solicitud enviada")).toBeInTheDocument();
    expect((screen.getByLabelText("¿Qué actividad le pides?") as HTMLInputElement).value).toBe("");
  });

  it("un error al aceptar no borra lo que ya estaba en pantalla", async () => {
    montar({ received: [solicitud({ id: 4 })] });
    expect(await screen.findByText("Cambiar la cámara 3")).toBeInTheDocument();
    acceptPeerRequest.mockRejectedValue(new Error("Sin permiso"));

    await userEvent.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(await screen.findByText("Sin permiso")).toBeInTheDocument();
    expect(screen.getByText("Cambiar la cámara 3")).toBeInTheDocument();
  });

  it("el motivo del rechazo se pide al rechazar, no antes", async () => {
    montar({ received: [solicitud({ id: 5 })] });
    await screen.findByText("Cambiar la cámara 3");
    expect(screen.queryByLabelText("Motivo del rechazo")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    expect(await screen.findByText("Escríbelo en tres letras o más.")).toBeInTheDocument();
    expect(rejectPeerRequest).not.toHaveBeenCalled();

    rejectPeerRequest.mockResolvedValue(solicitud({ id: 5, status: "REJECTED" }));
    await userEvent.type(screen.getByLabelText("Motivo del rechazo"), "Estoy en otra obra");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));

    await waitFor(() => expect(rejectPeerRequest).toHaveBeenCalledWith("tok", 5, "Estoy en otra obra"));
  });
});
