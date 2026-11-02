import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/UserContext", () => ({ useUser: () => ({ user: { id: 1, nombre: "Ana Ruiz" }, token: "jwt" }) }));

const crearActividadDeProyecto = vi.fn();
const obtenerProyecto = vi.fn();
vi.mock("@/lib/proyectos-api", async (original) => ({
  ...(await original<typeof import("@/lib/proyectos-api")>()),
  crearActividadDeProyecto: (...a: unknown[]) => crearActividadDeProyecto(...a),
  obtenerProyecto: (...a: unknown[]) => obtenerProyecto(...a),
}));

import NuevaActividad from "./NuevaActividad";
import type { SeccionProps } from "./tipos";

const PROYECTO = {
  id: 9,
  title: "Videovigilancia Plaza Norte",
  client: { id: 3, name: "Plaza Norte" },
  responsable: { id: 20, nombre: "Luis Herrera" },
} as unknown as SeccionProps["proyecto"];

const PERSONAS = [
  { id: 20, nombre: "Luis Herrera" },
  { id: 21, nombre: "Marco Díaz" },
];

function pintar(mutar: SeccionProps["mutar"]) {
  const onCerrar = vi.fn();
  const onCreada = vi.fn();
  render(
    <NuevaActividad
      proyecto={PROYECTO}
      token="jwt"
      personas={PERSONAS}
      ocupado={false}
      mutar={mutar}
      abierto
      onCerrar={onCerrar}
      onCreada={onCreada}
    />,
  );
  return { onCerrar, onCreada };
}

beforeEach(() => vi.clearAllMocks());

describe("actividad que nace del proyecto", () => {
  it("enseña lo que hereda y solo pregunta qué, quién y cuándo", async () => {
    crearActividadDeProyecto.mockResolvedValue({ id: 77 });
    obtenerProyecto.mockResolvedValue(PROYECTO);
    const mutar = vi.fn(async (accion: () => Promise<unknown>) => {
      await accion();
      return true;
    });
    const { onCerrar, onCreada } = pintar(mutar as unknown as SeccionProps["mutar"]);

    expect(screen.getByText("Plaza Norte")).toBeInTheDocument();
    expect(screen.getByText("Videovigilancia Plaza Norte")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/¿Qué hay que hacer\?/), { target: { value: "Instalar cámaras del acceso" } });
    fireEvent.change(screen.getByLabelText(/¿Quién\?/), { target: { value: "21" } });
    fireEvent.change(screen.getByLabelText(/¿Cuándo\?/), { target: { value: "2026-11-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear actividad" }));

    await waitFor(() => expect(onCreada).toHaveBeenCalled());
    expect(crearActividadDeProyecto).toHaveBeenCalledWith("jwt", 9, {
      titulo: "Instalar cámaras del acceso",
      responsableId: 21,
      fecha: "2026-11-10",
    });
    expect(onCerrar).toHaveBeenCalled();
  });

  it("por omisión la hace quien lleva el proyecto, y sin qué hacer no se crea", () => {
    pintar(vi.fn() as unknown as SeccionProps["mutar"]);
    expect(screen.getByLabelText(/¿Quién\?/)).toHaveValue("20");
    expect(screen.getByRole("button", { name: "Crear actividad" })).toBeDisabled();
  });

  it("si la API la rechaza, el diálogo se queda abierto con lo escrito", async () => {
    const mutar = vi.fn(async () => false);
    const { onCerrar, onCreada } = pintar(mutar as unknown as SeccionProps["mutar"]);
    const titulo = screen.getByLabelText(/¿Qué hay que hacer\?/);
    fireEvent.change(titulo, { target: { value: "Instalar cámaras" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear actividad" }));
    await waitFor(() => expect(mutar).toHaveBeenCalled());
    expect(onCerrar).not.toHaveBeenCalled();
    expect(onCreada).not.toHaveBeenCalled();
    expect(titulo).toHaveValue("Instalar cámaras");
  });
});
