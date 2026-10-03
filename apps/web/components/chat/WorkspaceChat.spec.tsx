import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/realtime-socket", () => ({
  createRealtimeSocket: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));

import WorkspaceChat from "../WorkspaceChat";

const ahora = new Date().toISOString();
const general = { id: 1, kind: "PUBLIC", slug: "general", name: "general", memberCount: 2, topic: "Avisos del equipo" };
const detalle = {
  ...general,
  members: [
    { id: 5, nombre: "Adam Pozos", email: "adam@nexara.mx", role: "OWNER" },
    { id: 6, nombre: "Laura Méndez", email: "laura@nexara.mx", role: "MEMBER" },
  ],
};
const mensajes = [
  {
    id: 100,
    channelId: 1,
    authorId: 6,
    parentId: null,
    kind: "TEXT",
    body: "Buenos días\n- revisar cámaras\n- cerrar AN-0031",
    createdAt: ahora,
    author: { id: 6, nombre: "Laura Méndez", email: "laura@nexara.mx" },
    replyCount: 0,
    reactions: [],
  },
];

type Llamada = { url: string; method: string; body: unknown };

function simularApi(opts: { crearCanal?: { status: number; body: unknown } } = {}) {
  const llamadas: Llamada[] = [];
  const responder = (status: number, body: unknown) =>
    ({ ok: status < 300, status, text: async () => (body == null ? "" : JSON.stringify(body)) }) as Response;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = (init.method ?? "GET").toUpperCase();
      const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
      llamadas.push({ url: String(url), method, body });
      const u = String(url);
      if (method === "POST" && /chat\/channels$/.test(u)) {
        const r = opts.crearCanal ?? { status: 201, body: { id: 2, kind: "PUBLIC", name: "obra" } };
        return responder(r.status, r.body);
      }
      if (/chat\/channels(\?|$)/.test(u)) return responder(200, [general]);
      if (u.includes("chat/channels/1/messages")) return responder(200, { messages: mensajes, hasMore: false });
      if (u.includes("chat/channels/1/pins")) return responder(200, { messages: [] });
      if (/chat\/channels\/1$/.test(u)) return responder(200, detalle);
      if (u.includes("chat/mentions")) return responder(200, []);
      return responder(200, null);
    }),
  );
  return llamadas;
}

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollTo = function scrollTo() {};
  Element.prototype.scrollIntoView = function scrollIntoView() {};
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorkspaceChat · armado por piezas", () => {
  it("abre el canal con cabecera, pestañas, mensajes con formato y el redactor", async () => {
    simularApi();
    render(<WorkspaceChat token="tkn" currentUserId={5} currentUserName="Adam Pozos" />);

    expect(await screen.findByRole("heading", { level: 2, name: "general" })).toBeInTheDocument();
    expect(await screen.findByText("Buenos días")).toBeInTheDocument();
    expect(screen.getByText("revisar cámaras").closest("ul")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Tema: Avisos del equipo. Editar tema" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Mensajes/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("toolbar", { name: "Formato del mensaje" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Mensaje a #general" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Fijados/ }));
    expect(await screen.findByText(/Aún no hay mensajes fijados/)).toBeInTheDocument();
  });

  it("«Crear canal» manda nombre, tema, descripción y privacidad", async () => {
    const llamadas = simularApi();
    render(<WorkspaceChat token="tkn" currentUserId={5} />);
    await screen.findByRole("heading", { level: 2, name: "general" });

    fireEvent.click(screen.getAllByRole("button", { name: "Crear canal" })[0]!);
    const dialogo = screen.getByRole("dialog", { name: "Crear canal" });
    fireEvent.change(within(dialogo).getByLabelText("Nombre del canal"), { target: { value: "obra" } });
    fireEvent.change(within(dialogo).getByLabelText(/^Tema/), { target: { value: "Avance diario" } });
    fireEvent.change(within(dialogo).getByLabelText(/^Descripción/), { target: { value: "Fotos y pendientes" } });
    fireEvent.click(within(dialogo).getByRole("checkbox"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Crear canal" }));

    await waitFor(() => {
      const alta = llamadas.find((l) => l.method === "POST" && /chat\/channels$/.test(l.url));
      expect(alta?.body).toEqual({ name: "obra", kind: "PRIVATE", topic: "Avance diario", description: "Fotos y pendientes" });
    });
  });

  it("si la API rechaza el canal, el error se ve dentro del modal", async () => {
    simularApi({ crearCanal: { status: 409, body: { message: "Ya existe un canal con ese nombre" } } });
    render(<WorkspaceChat token="tkn" currentUserId={5} />);
    await screen.findByRole("heading", { level: 2, name: "general" });

    fireEvent.click(screen.getAllByRole("button", { name: "Crear canal" })[0]!);
    const dialogo = screen.getByRole("dialog", { name: "Crear canal" });
    fireEvent.change(within(dialogo).getByLabelText("Nombre del canal"), { target: { value: "general" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Crear canal" }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(/Ya existe un canal/);
  });
});
