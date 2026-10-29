import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TablaEstandar } from "@/lib/tiempo-estandar";

const TABLA: TablaEstandar = {
  topeMin: 720,
  origen: { nombre: "Oficina NEXARA" },
  reglas: [
    {
      clave: "comercial",
      nombre: "Cotización",
      baseMin: 40,
      unidades: [{ clave: "partidas", singular: "partida", plural: "partidas", pregunta: "¿Cuántas partidas?", porUnidadMin: 4 }],
      destino: false,
      enLugarMin: 0,
    },
    { clave: "tarea:Junta", nombre: "Junta", baseMin: 0, unidades: [], destino: false, enLugarMin: 0, agenda: true },
  ],
};

const api = vi.hoisted(() => ({ fetchTablaEstandar: vi.fn(), fetchRutaEstandar: vi.fn() }));
vi.mock("@/lib/tiempo-estandar", async (original) => ({ ...(await original<typeof import("@/lib/tiempo-estandar")>()), ...api }));
// El mapa usa MapLibre, que jsdom no tiene; aquí no hay destino.
vi.mock("@/components/ClientLocationPicker", () => ({ default: () => null }));

import TiempoEstandarCampo from "./TiempoEstandarCampo";

function pintar(props: Partial<React.ComponentProps<typeof TiempoEstandarCampo>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <TiempoEstandarCampo
      token="tok"
      coreKind="comercial"
      ticketType={null}
      tipoTarea={null}
      complejidad=""
      sugerencia={null}
      salida={null}
      value={null}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange, ...utils };
}

describe("Tiempo estándar al asignar", () => {
  beforeEach(() => {
    api.fetchTablaEstandar.mockResolvedValue(TABLA);
  });

  it("con la cantidad calcula el total, lo desglosa y manda ese tiempo a la rueda", async () => {
    const { onChange } = pintar();
    const cantidad = await screen.findByLabelText("¿Cuántas partidas?");
    fireEvent.change(cantidad, { target: { value: "50" } });
    expect(await screen.findByText("4 h")).toBeTruthy();
    expect(screen.getByText("50 partidas × 4 min")).toBeTruthy();
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ unidades: { clave: "partidas", cantidad: 50 }, tiempoEstandarMin: 240, estandarCambiadoMotivo: null }),
        240,
      ),
    );
  });

  it("sin cantidad dice qué falta y la rueda queda libre", async () => {
    const { onChange } = pintar();
    expect(await screen.findByText("Para calcularlo falta la cantidad de partidas.")).toBeTruthy();
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ tiempoEstandarMin: null }), null));
  });

  it("toma la cantidad que leyó la IA y lo dice; si alguien la cambia, manda la suya", async () => {
    const { rerender, onChange } = pintar({ sugerencia: { cantidad: 5 } });
    expect(await screen.findByText(/La IA leyó el título:/)).toBeTruthy();
    expect(await screen.findByText("1 h")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sumar uno (partidas)" }));
    expect(screen.queryByText(/La IA leyó el título:/)).toBeNull();
    // Una sugerencia nueva ya no pisa lo que se escribió a mano.
    rerender(
      <TiempoEstandarCampo
        token="tok"
        coreKind="comercial"
        ticketType={null}
        tipoTarea={null}
        complejidad=""
        sugerencia={{ cantidad: 50 }}
        salida={null}
        value={null}
        onChange={onChange}
      />,
    );
    expect((screen.getByLabelText("¿Cuántas partidas?") as HTMLInputElement).value).toBe("6");
  });

  it("cambiar el tiempo pide motivo; con motivo, la rueda queda libre y el motivo se guarda", async () => {
    const { onChange } = pintar({ sugerencia: { cantidad: 5 } });
    fireEvent.click(await screen.findByRole("button", { name: "Cambiar el tiempo (pide motivo)" }));
    const motivo = screen.getByLabelText("¿Por qué otro tiempo?");
    fireEvent.change(motivo, { target: { value: "ok" } });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ estandarCambiadoMotivo: null }), 60));
    fireEvent.change(motivo, { target: { value: "El cliente pidió otro formato" } });
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ tiempoEstandarMin: 60, estandarCambiadoMotivo: "El cliente pidió otro formato" }),
        null,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Usar el estándar" }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ estandarCambiadoMotivo: null }), 60));
  });

  it("una junta va por agenda: lo dice y no fija tiempo", async () => {
    const { onChange } = pintar({ coreKind: "tarea", tipoTarea: "Junta" });
    expect(await screen.findByText(/dura lo que dure la agenda/)).toBeTruthy();
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(null, null));
  });

  it("un tipo sin regla no pinta nada", async () => {
    const { container } = pintar({ coreKind: "proyecto" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toBe("");
  });
});
