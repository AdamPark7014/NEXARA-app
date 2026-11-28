import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvisoDeshacerViewport, avisoDeshacer } from "./AvisoDeshacer";

describe("AvisoDeshacer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const mostrar = (deshacer: () => Promise<unknown>, alDeshacer = vi.fn()) => {
    render(<AvisoDeshacerViewport />);
    act(() => avisoDeshacer({ mensaje: "Actividad asignada a José", deshacer, alDeshacer }));
    return alDeshacer;
  };

  it("muestra el mensaje con Deshacer y la cuenta de segundos", () => {
    mostrar(async () => undefined);
    expect(screen.getByText("Actividad asignada a José")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Deshacer \(quedan 5 segundos\)/ })).toBeTruthy();
  });

  it("se va solo a los 5 segundos sin deshacer nada", () => {
    const deshacer = vi.fn(async () => undefined);
    mostrar(deshacer);
    act(() => vi.advanceTimersByTime(5_300));
    expect(screen.queryByText("Actividad asignada a José")).toBeNull();
    expect(deshacer).not.toHaveBeenCalled();
  });

  it("pasar el ratón encima pausa la cuenta", () => {
    mostrar(async () => undefined);
    fireEvent.mouseEnter(screen.getByRole("status"));
    act(() => vi.advanceTimersByTime(8_000));
    expect(screen.getByText("Actividad asignada a José")).toBeTruthy();
  });

  it("Deshacer llama una sola vez aunque se toque dos veces y avisa al terminar", async () => {
    const deshacer = vi.fn(async () => undefined);
    const alDeshacer = mostrar(deshacer);
    const boton = screen.getByRole("button", { name: /Deshacer/ });
    await act(async () => {
      fireEvent.click(boton);
      fireEvent.click(boton);
    });
    expect(deshacer).toHaveBeenCalledTimes(1);
    expect(alDeshacer).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Listo, se deshizo")).toBeTruthy();
  });

  it("si la API dice que ya pasó el plazo, lo muestra tal cual", async () => {
    const alDeshacer = mostrar(async () => {
      throw new Error(JSON.stringify({ message: "Ya pasó el tiempo para deshacerlo." }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Deshacer/ }));
    });
    expect(screen.getByText("Ya pasó el tiempo para deshacerlo.")).toBeTruthy();
    expect(alDeshacer).not.toHaveBeenCalled();
  });
});
