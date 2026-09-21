import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CentroOperativo from "./CentroOperativo";
import ResumenEquipo from "./ResumenEquipo";
import type { TeamBoardUser } from "@/lib/team-board-api";

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

const EQUIPO: TeamBoardUser[] = [
  persona({
    id: 1,
    nombre: "Luis Mora",
    openActivities: [
      {
        id: 10,
        anNumber: "AN-1042",
        titulo: "Preparación de equipo: 6 cámaras para la sucursal norte",
        estatus: "En Proceso",
        evidenceStatus: "PENDIENTE",
        progressPct: 0,
        coreKind: "servicio",
        fechaFinalizacion: null,
      },
    ],
  }),
  persona({ id: 2, nombre: "Christian Pozo", email: "gerencia@nexara.com.mx" }),
  persona({ id: 3, nombre: "Claudia Bernal", email: "claudia.bernal@nexara.com.mx" }),
  persona({ id: 4, nombre: "Ana Ruiz", status: "libre" }),
];

describe("CentroOperativo", () => {
  it("enseña al equipo pero deja fuera a Christian y a Claudia, por correo", () => {
    render(<CentroOperativo users={EQUIPO} onCerrar={() => {}} />);

    expect(screen.getByText("Luis Mora")).toBeInTheDocument();
    expect(screen.getByText("Ana Ruiz")).toBeInTheDocument();
    expect(screen.queryByText("Christian Pozo")).toBeNull();
    expect(screen.queryByText("Claudia Bernal")).toBeNull();
  });

  it("no corta lo que está haciendo la persona", () => {
    render(<CentroOperativo users={EQUIPO} onCerrar={() => {}} />);
    expect(
      screen.getByText("Preparación de equipo: 6 cámaras para la sucursal norte"),
    ).toBeInTheDocument();
  });

  it("los excluidos tampoco cuentan en el resumen de arriba", () => {
    render(<CentroOperativo users={EQUIPO} onCerrar={() => {}} />);
    expect(screen.getByText("1 trabajando")).toBeInTheDocument();
    expect(screen.getByText("1 libres")).toBeInTheDocument();
    expect(screen.getByText("0 con retraso")).toBeInTheDocument();
  });

  it("se sale con Esc y con el botón de salir", async () => {
    const cerrar = vi.fn();
    render(<CentroOperativo users={EQUIPO} onCerrar={cerrar} />);

    await userEvent.keyboard("{Escape}");
    expect(cerrar).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: /Salir/ }));
    expect(cerrar).toHaveBeenCalledTimes(2);
  });

  it("sin pantalla completa nativa (jsdom, iframe) se queda la capa, no se cae", () => {
    render(<CentroOperativo users={EQUIPO} onCerrar={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Centro operativo" })).toBeInTheDocument();
  });

  it("pide el tablero de nuevo cada 60 s y mueve el reloj", () => {
    vi.useFakeTimers();
    try {
      const refrescar = vi.fn();
      render(<CentroOperativo users={EQUIPO} onCerrar={() => {}} onRefrescar={refrescar} />);
      expect(refrescar).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(60_000));
      expect(refrescar).toHaveBeenCalledTimes(1);
      act(() => vi.advanceTimersByTime(60_000));
      expect(refrescar).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ResumenEquipo", () => {
  it("sin nadie no se pinta ninguna cifra (regla 7)", () => {
    const { container } = render(<ResumenEquipo users={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Trabajando")).toBeNull();
    expect(screen.queryByText("Con retraso")).toBeNull();
    expect(screen.queryByText("Libres")).toBeNull();
  });

  it("con gente pinta las tres cifras, una sola fila", () => {
    render(<ResumenEquipo users={EQUIPO} />);
    expect(screen.getByText("Trabajando")).toBeInTheDocument();
    expect(screen.getByText("Con retraso")).toBeInTheDocument();
    expect(screen.getByText("Libres")).toBeInTheDocument();
    expect(screen.queryByText("Flujo del periodo")).toBeNull();
  });
});
