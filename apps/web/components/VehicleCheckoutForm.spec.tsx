import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import VehicleCheckoutForm from "./VehicleCheckoutForm";
import { ETIQUETA_SLOT, SLOTS_VUELTA, SLOT_TABLERO, type SlotChecklist } from "@/lib/vehiculos-api";

/**
 * El checklist por pasos. Lo que no puede pasar: salir sin las fotos, o
 * devolver un vehículo con menos kilómetros de los que llevaba al salir.
 */

const imagen = (nombre: string) =>
  new File([new Uint8Array([1])], `${nombre}.jpg`, { type: "image/jpeg" });

function entradaDe(slot: SlotChecklist) {
  const etiqueta = ETIQUETA_SLOT[slot].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return screen.getByLabelText(new RegExp(`^${etiqueta}`));
}

async function subirVuelta(user: ReturnType<typeof userEvent.setup>) {
  for (const slot of SLOTS_VUELTA) {
    await user.upload(entradaDe(slot), imagen(slot));
  }
}

describe("VehicleCheckoutForm", () => {
  it("no deja pasar del primer paso sin las seis fotos, y dice cuáles faltan", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    render(<VehicleCheckoutForm mode="salida" onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/Faltan 6 fotos/);
    expect(screen.getByRole("alert")).toHaveTextContent(/Lateral izq\./);
    // Sigue en el paso 1: el tablero aún no aparece.
    expect(screen.queryByText("Odómetro y gasolina en una sola foto")).not.toBeInTheDocument();

    await user.upload(entradaDe("frontal"), imagen("frontal"));
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Faltan 5 fotos/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("con la vuelta completa pasa al tablero, y sin tablero no avanza", async () => {
    const user = userEvent.setup();
    render(<VehicleCheckoutForm mode="salida" onSubmit={vi.fn(async () => undefined)} />);

    await subirVuelta(user);
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByText("Odómetro y gasolina en una sola foto")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Falta la foto del tablero");
  });

  it("devolución: el km final no puede ser menor al de salida", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    render(<VehicleCheckoutForm mode="devolucion" odometroInicio={12000} onSubmit={onSubmit} />);

    await subirVuelta(user);
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await user.upload(entradaDe(SLOT_TABLERO), imagen("tablero"));
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    const km = screen.getByRole("spinbutton");
    await user.type(km, "11900");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/no puede ser menor/);
    expect(screen.queryByRole("button", { name: "Registrar devolución" })).not.toBeInTheDocument();

    await user.clear(km);
    await user.type(km, "12450");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    // Sigue faltando el combustible: el paso no se salta.
    expect(screen.getByRole("alert")).toHaveTextContent("Elige el nivel de combustible");

    await user.click(screen.getByRole("button", { name: "3/4" }));
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await user.click(screen.getByRole("button", { name: "Registrar devolución" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as unknown as {
      files: Record<string, File>;
      meta: Record<string, { capturedAt: string }>;
      odometroKm: number;
      combustible: string;
      combustiblePct: number;
    };
    expect(Object.keys(payload.files).sort()).toEqual([...SLOTS_VUELTA, SLOT_TABLERO].sort());
    expect(payload.odometroKm).toBe(12450);
    expect(payload.combustible).toBe("3/4");
    expect(payload.combustiblePct).toBe(75);
    // Cada foto lleva su hora de captura: la API rechaza las que no la traen.
    for (const slot of [...SLOTS_VUELTA, SLOT_TABLERO]) {
      expect(Date.parse(payload.meta[slot].capturedAt)).not.toBeNaN();
    }
  });
});
