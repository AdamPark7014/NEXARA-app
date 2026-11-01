import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Simbolo, { iconoDeSimbolo } from "./Simbolo";
import PedirTexto from "./PedirTexto";

describe("Simbolo", () => {
  it("convierte el emoji en un ícono de línea, con o sin selector de variante", () => {
    expect(iconoDeSimbolo("📊")).not.toBeNull();
    expect(iconoDeSimbolo("⚠️")).toBe(iconoDeSimbolo("⚠"));
    const { container } = render(<Simbolo valor="🔔" />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toBe("");
  });

  it("lo que no conoce lo deja como venía", () => {
    expect(iconoDeSimbolo("Texto")).toBeNull();
    expect(iconoDeSimbolo(undefined)).toBeNull();
    render(<Simbolo valor={<b>propio</b>} />);
    expect(screen.getByText("propio")).toBeInTheDocument();
  });
});

describe("PedirTexto", () => {
  const estado = (fn: (t: string) => void | Promise<void>, minimo = 5) => ({
    titulo: "Reportar daño",
    etiqueta: "Qué pasó",
    confirmar: "Reportar",
    minimo,
    fn,
  });

  it("no descarta en silencio: dice qué falta y no llama la acción", async () => {
    const fn = vi.fn();
    render(<PedirTexto estado={estado(fn)} onCerrar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Qué pasó/), "roto");
    await userEvent.click(screen.getByRole("button", { name: "Reportar" }));
    expect(fn).not.toHaveBeenCalled();
    expect(screen.getByText("Escribe al menos 5 letras.")).toBeInTheDocument();
  });

  it("manda el texto limpio y cierra", async () => {
    const fn = vi.fn();
    const onCerrar = vi.fn();
    render(<PedirTexto estado={estado(fn)} onCerrar={onCerrar} />);
    await userEvent.type(screen.getByLabelText(/Qué pasó/), "  mango roto  ");
    await userEvent.click(screen.getByRole("button", { name: "Reportar" }));
    expect(fn).toHaveBeenCalledWith("mango roto");
    expect(onCerrar).toHaveBeenCalled();
  });

  it("si la acción falla, lo escrito se queda para reintentar", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Sin conexión"));
    const onCerrar = vi.fn();
    render(<PedirTexto estado={estado(fn)} onCerrar={onCerrar} />);
    await userEvent.type(screen.getByLabelText(/Qué pasó/), "mango roto");
    await userEvent.click(screen.getByRole("button", { name: "Reportar" }));
    expect(onCerrar).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Qué pasó/)).toHaveValue("mango roto");
    expect(screen.getByRole("button", { name: "Reportar" })).toBeEnabled();
  });

  it("opcional: deja seguir sin texto", async () => {
    const fn = vi.fn();
    render(<PedirTexto estado={estado(fn, 0)} onCerrar={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Reportar" }));
    expect(fn).toHaveBeenCalledWith("");
  });
});
