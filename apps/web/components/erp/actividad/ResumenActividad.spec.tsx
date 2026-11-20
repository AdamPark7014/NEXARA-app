import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ResumenActividad from "./ResumenActividad";

vi.mock("@/lib/evidencia-campos", () => ({
  obtenerCamposEvidencia: vi.fn(async () => [
    { id: 1, nombre: "Cámara 1", momentos: ["ANTES", "DESPUES"], notas: "punto", orden: 1, fotos: {}, pendientes: ["ANTES"], completo: false },
    { id: 2, nombre: "Cámara 2", momentos: ["ANTES", "DESPUES"], notas: "punto", orden: 2, fotos: {}, pendientes: ["ANTES"], completo: false },
    { id: 3, nombre: "Cámara 3", momentos: ["ANTES", "DESPUES"], notas: "punto", orden: 3, fotos: {}, pendientes: ["ANTES"], completo: false },
    { id: 4, nombre: "Cámara 4", momentos: ["ANTES", "DESPUES"], notas: "punto", orden: 4, fotos: {}, pendientes: ["ANTES"], completo: false },
  ]),
}));

describe("ResumenActividad", () => {
  it("pinta los 5 bloques y la prioridad", async () => {
    render(
      <ResumenActividad
        token="tok"
        activityId={12}
        activity={{
          titulo: "Instalación Plaza Norte",
          coreKind: "proyecto",
          prioridad: "ALTA",
          estatus: "En Proceso",
          client: { name: "Anfora", salesClients: [{ id: 55 }] },
          project: { id: 30, title: "CCTV Plaza Norte" },
          responsable: { id: 1, nombre: "Carlos" },
          fechaInicio: "2026-11-20T10:00:00.000Z",
          fechaEntregaEsperada: "2026-11-20T18:00:00.000Z",
          cotizacion: { id: 90, quoteNumber: "COT-9", status: "APROBADA" },
        }}
      />,
    );

    expect(screen.getByText("QUÉ")).toBeTruthy();
    expect(screen.getByText("PARA QUIÉN")).toBeTruthy();
    expect(screen.getByText("POR QUÉ")).toBeTruthy();
    expect(screen.getByText("QUIÉN")).toBeTruthy();
    expect(screen.getByText("CUÁNDO")).toBeTruthy();
    expect(screen.getByText("Instalación Plaza Norte")).toBeTruthy();
    expect(screen.getByText("Anfora")).toBeTruthy();
    expect(screen.getByText("COT-9")).toBeTruthy();
    expect(screen.getByText(/Prioridad alta/i)).toBeTruthy();
    expect(await screen.findByText(/Cámara 1/)).toBeTruthy();
  });

  it("servicio correctivo muestra falla", () => {
    render(
      <ResumenActividad
        activity={{
          titulo: "DVR caído",
          coreKind: "servicio",
          ticketType: "CORRECTIVO",
          estatus: "Asignada",
        }}
        camposEvidencia={[]}
      />,
    );
    expect(screen.getAllByText("Falla (correctivo)").length).toBeGreaterThan(0);
  });
});
