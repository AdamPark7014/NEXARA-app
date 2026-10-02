import React, { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TablaPartidas from "./TablaPartidas";
import { totalesDePartidas, type PartidaEditor } from "@/lib/cotizacion-documento";

vi.mock("@/lib/smart-quote-api", () => ({ smartQuoteSearch: vi.fn().mockResolvedValue({ data: [] }) }));

/**
 * La última fila («Nueva partida») se ve como una partida más —hasta enseña su total— pero solo
 * cuenta en el subtotal y en el PDF cuando se agrega. Quien escribía el nombre y el precio sin
 * dar Enter creía tenerla y no salía (cotización NEX-CE00002201-0005, otra computadora).
 */
function Editor({ inicial = [] as PartidaEditor[], alCambiar }: { inicial?: PartidaEditor[]; alCambiar?: (p: PartidaEditor[]) => void }) {
  const [partidas, setPartidas] = useState(inicial);
  alCambiar?.(partidas);
  return (
    <div>
      <TablaPartidas
        partidas={partidas}
        setPartidas={setPartidas}
        editable
        moneda="MXN"
        token={null}
        totales={totalesDePartidas(partidas)}
      />
      <button type="button">Fuera de la tabla</button>
    </div>
  );
}

const ultimas = (f: ReturnType<typeof vi.fn>) => f.mock.calls.at(-1)![0] as PartidaEditor[];

describe("TablaPartidas · fila nueva", () => {
  it("lo escrito se agrega solo al salir de la fila, sin dar Enter", async () => {
    const alCambiar = vi.fn();
    render(<Editor alCambiar={alCambiar} />);
    await userEvent.type(screen.getByLabelText("Descripción de la nueva partida"), "Body Camera 2K");
    await userEvent.type(screen.getByLabelText("Precio unitario de la nueva partida"), "220");
    expect(ultimas(alCambiar)).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Fuera de la tabla" }));

    await waitFor(() => expect(ultimas(alCambiar)).toHaveLength(1));
    expect(ultimas(alCambiar)[0]).toMatchObject({ name: "Body Camera 2K", unitPrice: 220, qty: 1 });
    // la fila nueva queda vacía, lista para la siguiente
    expect((screen.getByLabelText("Descripción de la nueva partida") as HTMLInputElement).value).toBe("");
  });

  it("moverse entre las celdas de la misma fila (nombre → unidad → cantidad → precio) no la agrega a medias", async () => {
    const alCambiar = vi.fn();
    render(<Editor alCambiar={alCambiar} />);
    await userEvent.type(screen.getByLabelText("Descripción de la nueva partida"), "Switch");
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await new Promise((r) => setTimeout(r, 20));
    expect(ultimas(alCambiar)).toHaveLength(0);
    expect((screen.getByLabelText("Descripción de la nueva partida") as HTMLInputElement).value).toBe("Switch");
  });

  it("Enter la agrega una sola vez (no otra más al soltar el foco)", async () => {
    const alCambiar = vi.fn();
    render(<Editor alCambiar={alCambiar} />);
    await userEvent.type(screen.getByLabelText("Descripción de la nueva partida"), "Cable UTP{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Fuera de la tabla" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(ultimas(alCambiar)).toHaveLength(1);
  });

  it("sin nada escrito, salir de la fila no agrega partidas vacías", async () => {
    const alCambiar = vi.fn();
    render(<Editor alCambiar={alCambiar} />);
    await userEvent.click(screen.getByLabelText("Descripción de la nueva partida"));
    await userEvent.click(screen.getByRole("button", { name: "Fuera de la tabla" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(ultimas(alCambiar)).toHaveLength(0);
  });

  it("el botón ↵ avisa que hay algo por agregar y lo agrega al darle clic", async () => {
    const alCambiar = vi.fn();
    render(<Editor alCambiar={alCambiar} />);
    const boton = screen.getByRole("button", { name: "Agregar la partida" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Descripción de la nueva partida"), "Rack 12U");
    expect(boton.disabled).toBe(false);
    expect(boton.className).toMatch(/menuFilaPendiente/);
    await userEvent.click(boton);
    await waitFor(() => expect(ultimas(alCambiar)).toHaveLength(1));
  });
});
