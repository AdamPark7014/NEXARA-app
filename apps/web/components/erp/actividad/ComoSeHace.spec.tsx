import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ComoSeHace, { filasComoSeHace } from "./ComoSeHace";
import type { CampoEvidencia } from "@/lib/evidencia-campos";

vi.mock("@/lib/evidencia-campos", async () => {
  const actual = await vi.importActual<typeof import("@/lib/evidencia-campos")>("@/lib/evidencia-campos");
  return {
    ...actual,
    obtenerCamposEvidencia: vi.fn(async () => camposCamaras()),
  };
});

vi.mock("@/lib/ops-activities-api", () => ({
  listActivityTimeline: vi.fn(async () => ({
    events: [
      { id: "1", at: new Date().toISOString(), kind: "estado", title: "Pasó a En Proceso", icon: "📋" },
      { id: "2", at: new Date(Date.now() - 3600_000).toISOString(), kind: "agenda", title: "Asignada a Carlos", icon: "📅" },
    ],
  })),
}));

function camposCamaras(): CampoEvidencia[] {
  const nota = "Antes: punto. · Durante: fijada. · Después: en vivo.";
  return [1, 2, 3, 4].map((n) => ({
    id: n,
    nombre: `Cámara ${n}`,
    momentos: ["ANTES", "EN_PROGRESO", "DESPUES"] as const,
    notas: nota,
    orden: n,
    fotos: n === 1 ? { ANTES: { id: 10, momento: "ANTES" as const, photoUrl: "/a.jpg", latitude: null, longitude: null, capturedAt: null, por: null } } : {},
    pendientes: ["ANTES", "EN_PROGRESO", "DESPUES"] as CampoEvidencia["pendientes"],
    completo: false,
  }));
}

describe("filasComoSeHace", () => {
  it("agrupa Cámara 1–4 en un renglón", () => {
    const filas = filasComoSeHace(camposCamaras());
    expect(filas).toHaveLength(1);
    expect(filas[0].etiqueta).toBe("Cámara 1–4");
    expect(filas[0].celdas.find((c) => c.momento === "ANTES")).toMatchObject({ hechos: 1, total: 4, pedido: true });
  });
});

describe("ComoSeHace", () => {
  it("muestra tabla agrupada, indicaciones, ligado y lo último", async () => {
    render(
      <ComoSeHace
        activityId={12}
        token="tok"
        indicaciones="Llevar escalera y probar cada canal."
        ligados={[
          { id: "cot", etiqueta: "Cotización", texto: "COT-9", href: "/erp/cotizaciones/90" },
          { id: "doc", etiqueta: "Documentos", texto: "2 archivos" },
        ]}
      />,
    );

    expect(screen.getByText("Cómo se hace")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText("Cámara 1–4").length).toBeGreaterThan(0));
    expect(screen.getByText("Antes")).toBeTruthy();
    // El encabezado usa el mismo nombre del momento que el resto de la plataforma (`MOMENTO_LABEL`).
    expect(screen.getByText("En progreso")).toBeTruthy();
    expect(screen.getByText("Después")).toBeTruthy();
    expect(screen.getByText("1 de 4")).toBeTruthy();
    expect(screen.getByText(/Llevar escalera/)).toBeTruthy();
    expect(screen.getByText("Ligado a")).toBeTruthy();
    expect(screen.getByText("COT-9")).toBeTruthy();
    expect(screen.getByText("Lo último")).toBeTruthy();
    expect(await screen.findByText("Pasó a En Proceso")).toBeTruthy();
  });
});
