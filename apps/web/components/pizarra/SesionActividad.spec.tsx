import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PausarDeEquipo, SesionPropia } from "./SesionActividad";

const pausarMiActividad = vi.hoisted(() => vi.fn());
const reanudarMiActividad = vi.hoisted(() => vi.fn());
const pausarActividadDeEquipo = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sesion-actividad", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/sesion-actividad")>();
  return { ...real, pausarMiActividad, reanudarMiActividad, pausarActividadDeEquipo };
});

beforeEach(() => {
  pausarMiActividad.mockReset().mockResolvedValue({ ok: true });
  reanudarMiActividad.mockReset().mockResolvedValue({ ok: true });
  pausarActividadDeEquipo.mockReset().mockResolvedValue({ ok: true });
});

describe("SesionPropia (quien ejecuta)", () => {
  it("en pausa por el jefe: dice quién y por qué, y «Reanudar» llama a la API", async () => {
    const onDone = vi.fn();
    render(
      <SesionPropia
        token="tok"
        activityId={90}
        miId={13}
        onDone={onDone}
        actividad={{
          enPausa: true,
          pausaTipo: "PAUSA",
          pausadaPor: { id: 1, nombre: "Christian Del Pozo" },
          motivoPausa: "Atiende la falla urgente",
          estatus: "En Proceso",
        }}
      />,
    );
    expect(screen.getByText(/La pausó Christian Del: Atiende la falla urgente/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Reanudar actividad/ }));
    expect(reanudarMiActividad).toHaveBeenCalledWith("tok", 90);
    expect(onDone).toHaveBeenCalled();
  });

  it("con el reloj corriendo: «Pausar» pide confirmar y luego llama a la API", async () => {
    render(
      <SesionPropia
        token="tok"
        activityId={90}
        actividad={{ enCurso: true, sesionAbiertaDesde: "2026-09-17T15:00:00.000Z", estatus: "En Proceso" }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Pausar/ }));
    expect(pausarMiActividad).not.toHaveBeenCalled();
    // El diálogo de confirmación tiene su propio «Pausar».
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Pausar" }));
    expect(pausarMiActividad).toHaveBeenCalledWith("tok", 90);
  });

  it("sin iniciar, entregada o con una API anterior no pinta nada", () => {
    const { container } = render(<SesionPropia token="tok" activityId={90} actividad={{ estatus: "En Proceso" }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PausarDeEquipo (el jefe)", () => {
  it("no manda nada sin motivo de 10 caracteres y lo dice bajo el campo", async () => {
    render(<PausarDeEquipo token="tok" userId={13} activityId={90} nombre="Joan" />);
    await userEvent.click(screen.getByRole("button", { name: /Pausar/ }));
    await userEvent.type(screen.getByRole("textbox"), "urgente");
    await userEvent.click(screen.getByRole("button", { name: "Pausar actividad" }));
    expect(screen.getByText(/mínimo 10 caracteres/)).toBeInTheDocument();
    expect(pausarActividadDeEquipo).not.toHaveBeenCalled();
  });

  it("con motivo pausa a la persona y confirma que recibió el aviso", async () => {
    const onDone = vi.fn();
    render(<PausarDeEquipo token="tok" userId={13} activityId={90} nombre="Joan" onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: /Pausar/ }));
    await userEvent.type(screen.getByRole("textbox"), "Salió una falla urgente en Pádel del Arte");
    await userEvent.click(screen.getByRole("button", { name: "Pausar actividad" }));
    expect(pausarActividadDeEquipo).toHaveBeenCalledWith("tok", 13, 90, "Salió una falla urgente en Pádel del Arte");
    expect(await screen.findByText(/Joan ya recibió el aviso/)).toBeInTheDocument();
    expect(onDone).toHaveBeenCalled();
  });
});
