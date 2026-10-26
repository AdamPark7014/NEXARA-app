import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AvisoGuardia from "./AvisoGuardia";
import { diaCorto } from "@/lib/guardias-api";

afterEach(() => vi.unstubAllGlobals());

/**
 * Texto viejo: el aviso eran dos frases.
 * «El … es fin de semana y … no tiene guardia: sin guardia no se puede checar ese día. Prográmala en Asistencias → Guardias.»
 */
const VIEJO =
  "El sáb 3 oct es fin de semana y Israel no tiene guardia: sin guardia no se puede checar ese día. Prográmala en Asistencias → Guardias.";

function frases(texto: string): string[] {
  return texto
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function api(conGuardia: number[]) {
  const f = vi.fn(async (url: string) => {
    const cuerpo = String(url).includes("guardias/cobertura")
      ? { fecha: "2026-10-03", finDeSemana: true, conGuardia }
      : {};
    return { ok: true, status: 200, text: async () => JSON.stringify(cuerpo) } as unknown as Response;
  });
  vi.stubGlobal("fetch", f);
  return f;
}

describe("AvisoGuardia", () => {
  it("cita el texto viejo y lo deja en una frase, con el mismo hecho", async () => {
    expect(diaCorto("2026-10-03")).toBe("sáb 3 oct");
    expect(frases(VIEJO)).toHaveLength(2);
    expect(VIEJO).toContain("ese día. Prográmala en Asistencias → Guardias.");

    api([]);
    render(<AvisoGuardia token="tok" fecha="2026-10-03" personas={[{ id: 31, nombre: "Israel" }]} />);

    const aviso = await screen.findByText(/Israel no tiene guardia/);
    const texto = aviso.textContent ?? "";

    expect(texto).not.toContain(VIEJO);
    expect(texto).not.toContain("ese día. Prográmala en Asistencias → Guardias.");
    expect(frases(texto)).toHaveLength(1);
    expect(texto).toContain("El sáb 3 oct es fin de semana y Israel no tiene guardia");
    expect(texto).toContain("sin guardia no se puede checar ese día, prográmala en Asistencias → Guardias.");
  });
});
