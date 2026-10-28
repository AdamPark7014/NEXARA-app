import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TeamBoardUser } from "@/lib/team-board-api";
import LineaDelDia from "./LineaDelDia";

/** Hora de México de hoy: la línea siempre es del día en curso. */
function hoyMx(hhmm: string) {
  const fecha = new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
  return { fecha, iso: new Date(`${fecha}T${hhmm}:00-06:00`).toISOString() };
}

const { fecha, iso: entrada } = hoyMx("07:56");

const RESPUESTA = {
  fecha,
  scope: "subtree",
  generadoAt: new Date().toISOString(),
  personas: [
    {
      persona: { id: 20, nombre: "Raúl Méndez", email: "raul@nexara.com.mx", avatarUrl: null, puesto: "Instalador" },
      horario: { entrada: "08:00", salida: "17:00", etiqueta: "Horario propio · entra 08:00" },
      dia: {
        entrada,
        salida: null,
        abierta: true,
        retardo: false,
        minutosTarde: 0,
        sinChecada: false,
        faltaJustificada: false,
        minutosLaborados: 120,
        minutosOcupados: 100,
        entregasDelDia: 0,
        jornada: [{ inicio: entrada, fin: hoyMx("10:00").iso }],
        comida: [],
        actividades: [
          {
            activityId: 418,
            anNumber: "AN-0418",
            titulo: "Cableado de nodos",
            inicio: hoyMx("08:20").iso,
            fin: hoyMx("09:40").iso,
            enCurso: false,
            minutosEnJornada: 80,
          },
        ],
      },
    },
  ],
};

const USUARIO: TeamBoardUser = {
  id: 20,
  nombre: "Raúl Méndez",
  email: "raul@nexara.com.mx",
  avatarUrl: null,
  puesto: "Instalador",
  status: "libre",
  currentActivity: null,
  openActivities: [],
  clockInAt: entrada,
  workedMinutes: null,
  activityStartedAt: null,
  activityElapsedMinutes: null,
  entradaHoyAt: entrada,
  salidaHoyAt: null,
  idleSinceAt: hoyMx("09:40").iso,
};

afterEach(() => vi.unstubAllGlobals());

describe("LineaDelDia", () => {
  it("dibuja a la persona, enlaza su actividad y ofrece asignar en el hueco libre", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => RESPUESTA, text: async () => JSON.stringify(RESPUESTA) }) as unknown as Response),
    );
    render(<LineaDelDia token="tok" users={[USUARIO]} asignarHref={() => "/erp/pizarra/20/asignar"} />);

    const actividad = await screen.findByRole("link", { name: /Cableado de nodos/ });
    expect(actividad.getAttribute("href")).toBe("/erp/actividades/418");
    expect(screen.getByText("Entró 07:56")).toBeTruthy();
    await waitFor(() => {
      const libre = screen.queryByRole("link", { name: /Asignar/ });
      // El hueco libre solo existe si ahora ya pasó de las 09:40 de hoy en México.
      if (Date.now() > Date.parse(hoyMx("09:40").iso)) expect(libre?.getAttribute("href")).toBe("/erp/pizarra/20/asignar");
    });
  });

  it("si la línea no carga, avisa sin tumbar la vista", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => "" }) as unknown as Response));
    render(<LineaDelDia token="tok" users={[USUARIO]} asignarHref={() => undefined} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/No se pudo cargar la línea del día/);
    expect(screen.getByText("Raúl Méndez")).toBeTruthy();
  });
});
