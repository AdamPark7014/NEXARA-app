import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { accionDeAtajo, aplicarFormato } from "./formato";
import FormatToolbar from "./FormatToolbar";

describe("aplicarFormato · envolturas", () => {
  it("envuelve la selección en negrita y deja seleccionado el texto", () => {
    expect(aplicarFormato("hola mundo", 5, 10, "negrita")).toEqual({
      markup: "hola **mundo**",
      inicio: 7,
      fin: 12,
    });
  });

  it("funciona como interruptor: quita el formato si ya lo tiene", () => {
    expect(aplicarFormato("hola **mundo**", 7, 12, "negrita")).toEqual({
      markup: "hola mundo",
      inicio: 5,
      fin: 10,
    });
  });

  it("produce el markdown que ya se guarda para cursiva, tachado y código", () => {
    expect(aplicarFormato("ab", 0, 2, "cursiva").markup).toBe("_ab_");
    expect(aplicarFormato("ab", 0, 2, "tachado").markup).toBe("~~ab~~");
    expect(aplicarFormato("ab", 0, 2, "codigo").markup).toBe("`ab`");
  });

  it("sin selección deja el cursor entre los marcadores", () => {
    expect(aplicarFormato("hola", 4, 4, "negrita")).toEqual({ markup: "hola****", inicio: 6, fin: 6 });
  });

  it("nunca parte una pastilla de mención: la selección la toma entera", () => {
    const r = aplicarFormato("dile a [@Adam](user:3) ya", 8, 10, "negrita");
    expect(r.markup).toBe("dile a **[@Adam](user:3)** ya");
    expect(r).toMatchObject({ inicio: 9, fin: 14 });
  });
});

describe("aplicarFormato · enlaces y bloques", () => {
  it("enlace sin selección inserta la plantilla y selecciona el texto", () => {
    expect(aplicarFormato("ver ", 4, 4, "enlace")).toEqual({
      markup: "ver [texto](https://)",
      inicio: 5,
      fin: 10,
    });
  });

  it("enlace sobre un texto selecciona la dirección para escribirla encima", () => {
    const r = aplicarFormato("sitio", 0, 5, "enlace");
    expect(r.markup).toBe("[sitio](https://)");
    expect(r.markup.slice(r.inicio, r.fin)).toBe("https://");
  });

  it("enlace sobre una dirección la usa como destino", () => {
    const r = aplicarFormato("https://nexara.mx", 0, 17, "enlace");
    expect(r.markup).toBe("[texto](https://nexara.mx)");
    expect(r.markup.slice(r.inicio, r.fin)).toBe("texto");
  });

  it("bloque de código con cercas", () => {
    expect(aplicarFormato("a\nb", 0, 3, "bloqueCodigo").markup).toBe("```\na\nb\n```");
  });
});

describe("aplicarFormato · prefijos de renglón", () => {
  it("lista con viñetas en cada renglón y de vuelta", () => {
    const con = aplicarFormato("uno\ndos", 0, 7, "listaViñetas");
    expect(con.markup).toBe("- uno\n- dos");
    expect(aplicarFormato(con.markup, con.inicio, con.fin, "listaViñetas").markup).toBe("uno\ndos");
  });

  it("lista numerada", () => {
    expect(aplicarFormato("a\nb", 0, 3, "listaNumerada").markup).toBe("1. a\n2. b");
  });

  it("la cita solo toca el renglón del cursor", () => {
    expect(aplicarFormato("x\ny\nz", 2, 2, "cita").markup).toBe("x\n> y\nz");
  });
});

describe("accionDeAtajo", () => {
  const tecla = (key: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
    key,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...extra,
  });

  it("traduce los atajos de teclado", () => {
    expect(accionDeAtajo(tecla("b"))).toBe("negrita");
    expect(accionDeAtajo(tecla("i"))).toBe("cursiva");
    expect(accionDeAtajo(tecla("X", { shiftKey: true }))).toBe("tachado");
    expect(accionDeAtajo(tecla("b", { ctrlKey: false, metaKey: true }))).toBe("negrita");
  });

  it("ignora teclas sin Ctrl/⌘ o con Alt", () => {
    expect(accionDeAtajo(tecla("b", { ctrlKey: false }))).toBeNull();
    expect(accionDeAtajo(tecla("b", { altKey: true }))).toBeNull();
    expect(accionDeAtajo(tecla("Enter"))).toBeNull();
  });
});

describe("FormatToolbar", () => {
  it("expone una barra de herramientas con botones etiquetados", () => {
    render(<FormatToolbar onFormat={() => {}} />);
    const barra = screen.getByRole("toolbar", { name: "Formato del mensaje" });
    expect(barra).toBeInTheDocument();
    for (const nombre of [
      "Negrita",
      "Cursiva",
      "Tachado",
      "Enlace",
      "Lista numerada",
      "Lista con viñetas",
      "Cita",
      "Código",
      "Bloque de código",
    ]) {
      expect(screen.getByRole("button", { name: nombre })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Negrita" })).toHaveAttribute("data-tip", "Negrita (Ctrl+B)");
  });

  it("cada botón avisa su acción y no roba el foco del redactor", () => {
    const onFormat = vi.fn();
    render(<FormatToolbar onFormat={onFormat} />);
    const negrita = screen.getByRole("button", { name: "Negrita" });
    // `mousedown` prevenido: la selección del textarea sigue viva al aplicar el formato.
    expect(fireEvent.mouseDown(negrita)).toBe(false);
    fireEvent.click(negrita);
    fireEvent.click(screen.getByRole("button", { name: "Lista con viñetas" }));
    expect(onFormat.mock.calls).toEqual([["negrita"], ["listaViñetas"]]);
  });
});
