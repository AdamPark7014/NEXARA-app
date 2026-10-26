import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SeccionAlcance, { avisoAlcanceCotizacion } from "./SeccionAlcance";
import type { ProyectoDetalle } from "@/lib/proyectos-api";

const oraciones = (texto: string) =>
  texto
    .split(/(?<=[.!?])\s+/)
    .map((parte) => parte.trim())
    .filter(Boolean);

/** Las dos frases que el recuadro azul decía cuando el proyecto ya trae cotización. */
const TEXTO_VIEJO =
  "Copia los bloques de alcance de la cotización como entregables. Si ya los trajiste, no se duplican.";

describe("SeccionAlcance", () => {
  it("el aviso cabe en una frase y deja atrás el texto viejo", () => {
    expect(oraciones(TEXTO_VIEJO)).toHaveLength(2);
    expect(oraciones(avisoAlcanceCotizacion)).toEqual([avisoAlcanceCotizacion]);
    expect(avisoAlcanceCotizacion).toBe(
      "Copia los bloques de alcance de la cotización como entregables: si ya los trajiste, no se duplican.",
    );
    expect(avisoAlcanceCotizacion).not.toBe(TEXTO_VIEJO);

    const proyecto = {
      id: 7,
      scopeSummary: null,
      scopeItems: [],
      cotizacion: { id: 3, quoteNumber: "COT-1042", folioEnviado: "COT-1042" },
    } as unknown as ProyectoDetalle;

    render(
      <SeccionAlcance
        proyecto={proyecto}
        token="jwt"
        hoy="2026-10-25"
        ocupado={false}
        personas={[]}
        mutar={async () => true}
        confirmar={() => undefined}
      />,
    );

    const aviso = screen.getByText(/Copia los bloques de alcance/);
    expect(aviso.textContent).toContain(avisoAlcanceCotizacion);
    expect(aviso.textContent).not.toContain(TEXTO_VIEJO);
    expect(aviso.textContent).not.toContain("entregables. Si ya");
    expect(screen.getByRole("button", { name: "Traer alcance de la cotización" })).toBeTruthy();
  });
});
