import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatSidebar from "./ChatSidebar";
import { SECTIONS_KEY } from "./chat-utils";
import type { Channel } from "./types";

const canal = (id: number, name: string, extra: Partial<Channel> = {}): Channel => ({
  id,
  kind: "PUBLIC",
  slug: name,
  name,
  memberCount: 4,
  ...extra,
});

const general = canal(1, "general");
const operaciones = canal(2, "operaciones", { unread: true, unreadCount: 3 });
const ventas = canal(3, "ventas");
const ana = canal(10, "Ana Ruiz", { kind: "DIRECT", slug: null, peer: { id: 7, nombre: "Ana Ruiz", email: "ana@nexara.mx" } });

function pintar(over: Partial<React.ComponentProps<typeof ChatSidebar>> = {}) {
  const props: React.ComponentProps<typeof ChatSidebar> = {
    starred: [],
    publics: [general, operaciones, ventas],
    dms: [ana],
    activeId: 1,
    loading: false,
    presence: {},
    starredIds: [],
    totalUnread: 3,
    filter: "",
    onFilterChange: vi.fn(),
    onSelect: vi.fn(),
    onToggleStar: vi.fn(),
    onNewChannel: vi.fn(),
    onNewDm: vi.fn(),
    onOpenSwitcher: vi.fn(),
    ...over,
  };
  return { props, ...render(<ChatSidebar {...props} />) };
}

beforeEach(() => {
  localStorage.clear();
});

describe("ChatSidebar · secciones plegables", () => {
  it("pliega Canales, conserva el abierto y lo no leído, y recuerda el estado", () => {
    pintar();
    const toggle = screen.getByRole("button", { name: /^Canales/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Canal ventas" })).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Canal ventas" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Canal general" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Canal operaciones, 3 sin leer" })).toBeInTheDocument();
    expect(screen.getByLabelText("1 ocultos")).toHaveTextContent("+1");
    expect(JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "{}")).toMatchObject({ canales: true });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Canal ventas" })).toBeInTheDocument();
  });

  it("arranca con el estado guardado y lo ignora mientras se filtra", () => {
    localStorage.setItem(SECTIONS_KEY, JSON.stringify({ directos: true }));
    const { rerender, props } = pintar();
    expect(screen.getByRole("button", { name: /^Mensajes directos/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Mensaje directo con Ana Ruiz" })).not.toBeInTheDocument();

    rerender(<ChatSidebar {...props} filter="ana" />);
    expect(screen.getByRole("button", { name: /^Mensajes directos/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Mensaje directo con Ana Ruiz" })).toBeInTheDocument();
  });

  it("Favoritos solo aparece si hay favoritos", () => {
    const { rerender, props } = pintar();
    expect(screen.queryByRole("button", { name: /^Favoritos/ })).not.toBeInTheDocument();
    rerender(<ChatSidebar {...props} starred={[ventas]} publics={[general, operaciones]} starredIds={[3]} />);
    expect(screen.getByRole("button", { name: /^Favoritos/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Quitar ventas de favoritos" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("ChatSidebar · acciones", () => {
  it("el «+» de cada sección abre el diálogo que corresponde", () => {
    const { props } = pintar();
    fireEvent.click(screen.getAllByRole("button", { name: "Crear canal" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Nuevo mensaje directo" })[0]!);
    expect(props.onNewChannel).toHaveBeenCalledTimes(1);
    expect(props.onNewDm).toHaveBeenCalledTimes(1);
  });

  it("selecciona canales y marca favoritos sin abrir el canal", () => {
    const { props } = pintar();
    fireEvent.click(screen.getByRole("button", { name: "Canal ventas" }));
    fireEvent.click(screen.getByRole("button", { name: "Añadir ventas a favoritos" }));
    expect(props.onSelect).toHaveBeenCalledWith(3);
    expect(props.onSelect).toHaveBeenCalledTimes(1);
    expect(props.onToggleStar).toHaveBeenCalledWith(3);
  });

  it("marca el canal abierto y el contador total de no leídos", () => {
    pintar();
    expect(screen.getByRole("button", { name: "Canal general" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("3 mensajes sin leer")).toHaveTextContent("3");
  });
});
