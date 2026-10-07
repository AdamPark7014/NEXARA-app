import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AtencionEquipo from "./AtencionEquipo";
import type { TeamBoardUser } from "@/lib/team-board-api";

/** Miércoles 07-10-2026, 12:20 en México. */
const AHORA = Date.parse("2026-10-07T18:20:00.000Z");
const ENTRADA_1005 = "2026-10-07T16:05:00.000Z";

function persona(parcial: Partial<TeamBoardUser> & Pick<TeamBoardUser, "id" | "nombre">): TeamBoardUser {
  return {
    email: `persona${parcial.id}@nexara.com.mx`,
    avatarUrl: null,
    puesto: "Técnico",
    status: "activo",
    currentActivity: null,
    clockInAt: null,
    workedMinutes: null,
    activityStartedAt: null,
    activityElapsedMinutes: null,
    ...parcial,
  };
}

const sinNada = (id: number, nombre: string) =>
  persona({ id, nombre, status: "sin_actividad", entradaHoyAt: ENTRADA_1005, salidaHoyAt: null, idleSinceAt: ENTRADA_1005 });

describe("AtencionEquipo", () => {
  it("si nadie pide atención no pinta nada", () => {
    const { container } = render(
      <AtencionEquipo users={[persona({ id: 1, nombre: "Luis Mora" })]} ahora={AHORA} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("solo pinta las columnas con gente, con su detalle y el enlace a la ficha", () => {
    render(
      <AtencionEquipo
        ahora={AHORA}
        users={[
          persona({
            id: 7,
            nombre: "Luis Mora",
            status: "atrasado",
            currentActivity: {
              id: 11,
              anNumber: "AN-0011",
              titulo: "Instalar cámaras",
              estatus: "Pendiente",
              fechaMaxima: null,
              bucket: "daily",
            },
            currentLateMinutes: 135,
            currentLateReason: "inicio",
          }),
          sinNada(38, "Daniela Paz"),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: /Atrasados/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Sin nada asignado/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Sin entrada hoy/ })).toBeNull();
    expect(screen.getByText("Atrasada · 2 h 15 min · no la ha iniciado")).toBeInTheDocument();
    expect(screen.getByText("Entró 10:05 · sin nada desde que entró (hace 2 h 15 min)")).toBeInTheDocument();
    expect(screen.getByText("Sin actividades terminadas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Daniela Paz/ })).toHaveAttribute("href", "/erp/pizarra/38");
    // Sin permiso de asignar no hay botón.
    expect(screen.queryByRole("link", { name: /Asignar una actividad/ })).toBeNull();
  });

  it("con permiso, «＋ Asignar» solo en los que no tienen nada", () => {
    render(
      <AtencionEquipo
        ahora={AHORA}
        users={[sinNada(38, "Daniela Paz"), persona({ id: 9, nombre: "Ana Ruiz", status: "sin_actividad", entradaHoyAt: null })]}
        asignarHref={(u) => `/erp/pizarra/${u.id}/asignar`}
      />,
    );
    const asignar = screen.getAllByRole("link", { name: /Asignar una actividad/ });
    expect(asignar).toHaveLength(1);
    expect(asignar[0]).toHaveAttribute("href", "/erp/pizarra/38/asignar");
  });

  it("más de cinco en una columna: «Ver N más» despliega el resto", async () => {
    const equipo = Array.from({ length: 7 }, (_, i) => sinNada(i + 1, `Persona ${i + 1}`));
    render(<AtencionEquipo ahora={AHORA} users={equipo} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    await userEvent.click(screen.getByRole("button", { name: "Ver 2 más" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Ver menos" })).toBeInTheDocument();
  });
});
