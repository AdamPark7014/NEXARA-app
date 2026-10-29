import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ tiempoCalculado: vi.fn() }));
vi.mock("@/lib/my-activities-api", async (original) => ({ ...(await original<typeof import("@/lib/my-activities-api")>()), ...api }));

import TiempoFijoCampo from "./TiempoFijoCampo";

describe("TiempoFijoCampo (autoasignación)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.tiempoCalculado.mockResolvedValue({
      tiempoEstandarMin: 165,
      desglose: [
        { concepto: "Base de instalación", minutos: 30 },
        { concepto: "3 dispositivos × 45 min", minutos: 135 },
      ],
      supuestos: ["traslado aproximado (30 min de ida y 30 de vuelta)"],
      complejidad: "BASICA",
      unidades: { clave: "dispositivos", cantidad: 3 },
      fechaEntregaEsperada: "2026-10-29T18:45:00.000Z",
    });
  });

  it("enseña en solo lectura el tiempo, su desglose y la entrega que salen del título", async () => {
    const onMinutos = vi.fn();
    render(
      <TiempoFijoCampo
        token="tok"
        titulo="Instalar 3 cámaras en recepción"
        coreKind="tarea"
        ticketTypeCustom="Instalación"
        fechaInicio="2026-10-29T16:00:00.000Z"
        onMinutos={onMinutos}
      />,
    );
    await waitFor(() => expect(api.tiempoCalculado).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(api.tiempoCalculado.mock.calls[0][1]).toMatchObject({
      titulo: "Instalar 3 cámaras en recepción",
      coreKind: "tarea",
      ticketTypeCustom: "Instalación",
      fechaInicio: "2026-10-29T16:00:00.000Z",
    });
    expect(await screen.findByText("3 dispositivos × 45 min")).toBeInTheDocument();
    expect(screen.getByText("Entregar a más tardar")).toBeInTheDocument();
    expect(screen.getByText("12:45")).toBeInTheDocument();
    expect(screen.getByText(/Supuesto: traslado aproximado/)).toBeInTheDocument();
    expect(screen.getByText(/no se edita/)).toBeInTheDocument();
    expect(onMinutos).toHaveBeenCalledWith(165);
    // Nada que editar: sin campos ni botones.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("sin título no pide nada y dice de dónde sale", () => {
    render(<TiempoFijoCampo token="tok" titulo="" coreKind="tarea" fechaInicio={null} />);
    expect(screen.getByText(/Escribe el título/)).toBeInTheDocument();
    expect(api.tiempoCalculado).not.toHaveBeenCalled();
  });
});
