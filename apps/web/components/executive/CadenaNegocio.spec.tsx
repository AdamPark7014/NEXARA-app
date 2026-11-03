import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CadenaNegocio, { SiguientePasoNegocio } from "./CadenaNegocio";
import type { CadenaNegocio as Cadena } from "@/lib/hoy-cadena";

const HOY: Cadena = {
  cotizaciones: { total: 56, borradores: 56, vigentesPorEnviar: 29, enviadas: 0, porDecidir: 0, ganadas: 0, ganadasSinProyecto: 0 },
  proyectos: 1,
  facturas: 0,
  cobrado: 0,
  actividades: { total: 378, conProyecto: 1, porValidar: 38, enProceso: 2, finalizadas: 305 },
};

describe("Hoy: cómo va el negocio", () => {
  it("enseña los seis eslabones y marca dónde se detiene", () => {
    render(<CadenaNegocio cadena={HOY} faltanCifras />);
    const pasos = screen.getAllByRole("listitem");
    expect(pasos).toHaveLength(6);
    expect(pasos[1]).toHaveAttribute("aria-current", "step");
    expect(within(pasos[1]!).getByText("Aquí se detiene")).toBeInTheDocument();
    expect(screen.getByText(/aparecen aquí con su primer dato/)).toBeInTheDocument();
  });

  it("con todas las cifras no avisa que faltan", () => {
    render(<CadenaNegocio cadena={HOY} faltanCifras={false} />);
    expect(screen.queryByText(/aparecen aquí con su primer dato/)).not.toBeInTheDocument();
  });

  it("el siguiente paso lleva a resolverlo", () => {
    render(<SiguientePasoNegocio cadena={HOY} />);
    expect(screen.getByText("Siguiente paso: marcar las que ya salieron")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver cotizaciones" })).toHaveAttribute("href", "/erp/cotizaciones?estado=BORRADOR");
  });

  it("sin nada que hacer no enseña la franja", () => {
    const { container } = render(
      <SiguientePasoNegocio cadena={{ ...HOY, cotizaciones: { ...HOY.cotizaciones, vigentesPorEnviar: 0 } }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
