import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TiempoActividad from "./TiempoActividad";

describe("TiempoActividad", () => {
  it("muestra lo trabajado contra el plan, el estado y el tope", () => {
    render(<TiempoActividad minutosPlan={450} minutosReales={340} enCurso />);
    expect(screen.getByText("5 h 40 min")).toBeTruthy();
    expect(screen.getByText("de 7 h 30 min planeadas")).toBeTruthy();
    expect(screen.getByText("va en tiempo")).toBeTruthy();
    expect(screen.getByText(/Tope: 9 h 23 min \(plan \+ 25 %\)/)).toBeTruthy();
    expect(screen.getByText("en curso")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/de 7 h 30 min planeadas: va en tiempo/);
  });

  it("marca cuando se pasa del tope", () => {
    const { container } = render(<TiempoActividad minutosPlan={60} minutosReales={100} tiempoMaximoMin={80} />);
    expect(screen.getByText("se pasó 20 min del tope")).toBeTruthy();
    expect(container.querySelector("[data-estado='excedida']")).toBeTruthy();
  });

  it("sin plan ni tiempo no se pinta", () => {
    const { container } = render(<TiempoActividad />);
    expect(container.firstChild).toBeNull();
  });
});
