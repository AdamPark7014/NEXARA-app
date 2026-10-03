import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { highlightMatches, renderMessageBody } from "./rich-text";

const pintar = (nodes: React.ReactNode) => render(<div>{nodes}</div>).container.firstElementChild as HTMLElement;

describe("renderMessageBody", () => {
  it("un mensaje sin bloques se pinta en línea, como antes", () => {
    const el = pintar(renderMessageBody("hola **equipo** y ~~nadie~~"));
    expect(el.querySelector("strong")).toHaveTextContent("equipo");
    expect(el.querySelector("s")).toHaveTextContent("nadie");
    expect(el.querySelector("ul, ol, blockquote, pre")).toBeNull();
  });

  it("pinta listas, citas y bloques de código del markdown de la barra", () => {
    const el = pintar(renderMessageBody("Pendientes:\n- cable\n- **cámaras**\n> ojo\n1. uno\n2. dos\n```\nnpm run\n```"));
    expect(el.querySelectorAll("ul li")).toHaveLength(2);
    expect(el.querySelector("ul strong")).toHaveTextContent("cámaras");
    expect(el.querySelector("blockquote")).toHaveTextContent("ojo");
    expect(el.querySelectorAll("ol li")).toHaveLength(2);
    expect(el.querySelector("pre code")).toHaveTextContent("npm run");
  });

  it("los enlaces externos abren en otra pestaña", () => {
    const a = pintar(renderMessageBody("ver [manual](https://nexara.mx/manual)")).querySelector("a");
    expect(a).toHaveAttribute("href", "https://nexara.mx/manual");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveTextContent("manual");
  });

  it("una pastilla interna no puede apuntar a otro sitio", () => {
    const el = pintar(renderMessageBody("[AN-0031](//otro.com/x) y [NEX-1](/\\otro.com) y [AN-0015](/erp/actividades/15)"));
    const enlaces = el.querySelectorAll("a");
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0]).toHaveAttribute("href", "/erp/actividades/15");
    expect(el).toHaveTextContent("AN-0031");
  });
});

describe("highlightMatches", () => {
  it("resalta sin distinguir mayúsculas ni acentos", () => {
    const el = pintar(highlightMatches("Cámara del almacén", "camara"));
    expect(el.querySelector("mark")).toHaveTextContent("Cámara");
  });
});
