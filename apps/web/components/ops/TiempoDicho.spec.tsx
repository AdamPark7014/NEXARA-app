import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TiempoDicho from "./TiempoDicho";

const decir = vi.fn();
vi.mock("@/lib/ops-activities-api", () => ({ decirTiempoActividad: (...a: unknown[]) => decir(...a) }));

const base = { token: "t", activityId: 5, relojMin: 370, preguntar: true, soyQuienEjecuta: true };

describe("cuánto tomó de verdad", () => {
  beforeEach(() => {
    decir.mockReset();
    decir.mockImplementation(async (_t, _id, minutos) => ({ tiempoDichoMin: minutos, preguntarTiempo: false }));
  });

  it("«Sí» confirma el reloj en un toque", async () => {
    render(<TiempoDicho {...base} />);
    expect(screen.getByText(/¿Te tomó 6 h 10 min\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sí" }));
    await waitFor(() => expect(screen.getByText("Dijiste que tomó 6 h 10 min")).toBeTruthy());
    expect(decir).toHaveBeenCalledWith("t", 5, 370);
  });

  it("«Fue otro tiempo» guarda lo escrito, y sin tiempo no deja guardar", async () => {
    render(<TiempoDicho {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Fue otro tiempo" }));
    const guardar = screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Horas"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Minutos"), { target: { value: "30" } });
    fireEvent.click(guardar);
    await waitFor(() => expect(decir).toHaveBeenCalledWith("t", 5, 150));
    expect(await screen.findByText("Dijiste que tomó 2 h 30 min")).toBeTruthy();
  });

  it("solo le pregunta a quien la ejecutó; los demás ven lo que dijo", () => {
    const { container, rerender } = render(<TiempoDicho {...base} soyQuienEjecuta={false} />);
    expect(container.textContent).toBe("");
    rerender(<TiempoDicho {...base} key="otro" soyQuienEjecuta={false} dichoMin={120} preguntar={false} />);
    expect(screen.getByText("Quien la ejecutó dijo que tomó 2 h")).toBeTruthy();
  });

  it("si falla lo dice y deja reintentar", async () => {
    decir.mockRejectedValueOnce(new Error("sin red"));
    render(<TiempoDicho {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Sí" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sí" })).toBeTruthy();
  });
});
