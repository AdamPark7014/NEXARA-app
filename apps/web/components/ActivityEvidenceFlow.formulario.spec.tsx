import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { claveDeFormulario } from "@/lib/evidence-flow-helpers";

vi.mock("@/components/UserContext", () => ({ useUser: () => ({ user: null, token: null }) }));
vi.mock("@/lib/realtime-socket", () => ({ createRealtimeSocket: vi.fn() }));
vi.mock("@/components/ops/UbicacionActividad", () => ({
  default: () => null,
  AvisoFueraDeZona: () => null,
  useGeocerca: () => ({ estado: null, error: null, cargando: false, recargar: async () => {}, actualizarAlerta: () => {} }),
}));

import { DigitalEvidenceForm } from "./ActivityEvidenceFlow";

/**
 * Al corregir el formulario, la pantalla se relee sola (volver a la pestaña, aviso en tiempo
 * real). Cada relectura trae un objeto nuevo con lo mismo guardado, y eso reiniciaba el
 * formulario: se perdía lo que la persona llevaba escrito.
 */
describe("formulario de evidencia: una relectura no borra lo que se está escribiendo", () => {
  const guardado = { queHiciste: "Visité al cliente" };

  it("el mismo contenido en un objeto nuevo conserva lo escrito", async () => {
    const { rerender } = render(
      <DigitalEvidenceForm coreKind="tarea" onSubmit={() => {}} loading={false} initialData={guardado} />,
    );
    const campo = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(campo.value).toBe("Visité al cliente");

    await userEvent.type(campo, " y dejé la cotización");
    expect(campo.value).toBe("Visité al cliente y dejé la cotización");

    // Relectura: mismo contenido, otro objeto.
    rerender(
      <DigitalEvidenceForm coreKind="tarea" onSubmit={() => {}} loading={false} initialData={{ ...guardado }} />,
    );
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Visité al cliente y dejé la cotización");
  });

  it("si lo guardado sí cambió (lo corrigió en otro dispositivo), se muestra lo nuevo", () => {
    const { rerender } = render(
      <DigitalEvidenceForm coreKind="tarea" onSubmit={() => {}} loading={false} initialData={guardado} />,
    );
    rerender(
      <DigitalEvidenceForm
        coreKind="tarea"
        onSubmit={() => {}}
        loading={false}
        initialData={{ queHiciste: "Entregué el equipo" }}
      />,
    );
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Entregué el equipo");
  });

  it("la huella no depende del objeto ni del orden de las llaves", () => {
    expect(claveDeFormulario({ a: "1", b: "2" })).toBe(claveDeFormulario({ b: "2", a: "1" }));
    expect(claveDeFormulario({ a: "1" })).not.toBe(claveDeFormulario({ a: "2" }));
    expect(claveDeFormulario(null)).toBe("");
    expect(claveDeFormulario(undefined)).toBe("");
  });
});
