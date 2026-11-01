import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { documentoVacio, type DocumentoCotizacion } from "@/lib/cotizacion-documento";
import type { BloqueAlcance } from "@/lib/cotizaciones-api";
import PuntosPortada from "./PuntosPortada";

const SUGERIDOS: BloqueAlcance[] = [
  { clave: "omision:justificacion", titulo: "Justificación tecnológica", texto: "Por qué estos equipos.", vinetas: ["Compatibilidad: sí."] },
  { clave: "omision:beneficios", titulo: "Beneficios de la canalización industrial", texto: "Protege.", vinetas: [] },
  { clave: "omision:especificacion", titulo: "Especificación funcional de las cámaras seleccionadas", texto: "Equipos.", vinetas: [] },
  { clave: "omision:monitoreo", titulo: "Centro de monitoreo", texto: "Graba.", vinetas: [] },
];

let ultimo: DocumentoCotizacion;

function Prueba({ inicial, editable = true }: { inicial?: Partial<DocumentoCotizacion>; editable?: boolean }) {
  const [doc, setDoc] = useState<DocumentoCotizacion>({ ...documentoVacio(), ...inicial });
  ultimo = doc;
  return (
    <PuntosPortada doc={doc} cambiar={(f) => setDoc((d) => f(d))} editable={editable} sugeridos={SUGERIDOS} hayPlanos={false} />
  );
}

const valores = () => screen.getAllByRole("textbox").map((c) => (c as HTMLInputElement).value || (c as HTMLInputElement).placeholder);

describe("puntos de la portada", () => {
  it("vienen llenos por omisión: los siete del diseño, sin guardar nada todavía", () => {
    render(<Prueba />);
    expect(valores()).toEqual([
      "Alcance ejecutivo",
      "Justificación tecnológica",
      "Beneficios de la canalización industrial",
      "Especificación funcional de las cámaras seleccionadas",
      "Centro de monitoreo",
      "Póliza de garantías, exclusiones y vigencia comercial",
      "Propuesta económica detallada",
    ]);
    expect(ultimo.bloques).toEqual([]);
    expect(screen.queryByRole("button", { name: "Volver a los puntos de siempre" })).not.toBeInTheDocument();
  });

  it("al renombrar uno, conserva los demás con todo y su texto", () => {
    render(<Prueba />);
    fireEvent.change(screen.getByLabelText("Punto 02 de la portada"), { target: { value: "Por qué esta solución" } });
    expect(ultimo.bloques.map((b) => b.titulo)).toEqual([
      "Por qué esta solución",
      "Beneficios de la canalización industrial",
      "Especificación funcional de las cámaras seleccionadas",
      "Centro de monitoreo",
    ]);
    expect(ultimo.bloques[0]!.texto).toBe("Por qué estos equipos.");
    expect(screen.getByLabelText("Punto 02 de la portada")).toHaveValue("Por qué esta solución");
  });

  it("los títulos fijos también se editan y quedan en las opciones", () => {
    render(<Prueba />);
    fireEvent.change(screen.getByLabelText("Punto 07 de la portada"), { target: { value: "Inversión" } });
    expect(ultimo.opciones.titulos.cotizacion).toBe("Inversión");
    expect(ultimo.bloques).toEqual([]);
  });

  it("se pueden quitar y agregar, y volver a los de siempre", async () => {
    render(<Prueba />);
    await userEvent.click(screen.getByRole("button", { name: "Quitar el punto 03" }));
    expect(ultimo.bloques.map((b) => b.titulo)).not.toContain("Beneficios de la canalización industrial");
    expect(valores()).toHaveLength(6);

    await userEvent.click(screen.getByRole("button", { name: "+ Agregar punto" }));
    expect(ultimo.bloques.at(-1)!.titulo).toBe("Nuevo punto");
    expect(valores()).toHaveLength(7);

    await userEvent.click(screen.getByRole("button", { name: "Quitar el punto 01" }));
    expect(ultimo.opciones.secciones.objetivo).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "Volver a los puntos de siempre" }));
    expect(ultimo.bloques).toEqual([]);
    expect(ultimo.opciones.secciones.objetivo).toBe(true);
    expect(valores()).toHaveLength(7);
  });

  it("quitar el último apaga el alcance: no regresan solos los de siempre", async () => {
    const bloques = documentoVacio().bloques;
    render(<Prueba inicial={{ bloques: [...bloques, { key: "a", clave: "x", titulo: "Único", texto: "", vinetas: [] }] }} />);
    await userEvent.click(screen.getByRole("button", { name: "Quitar el punto 02" }));
    expect(ultimo.bloques).toEqual([]);
    expect(ultimo.opciones.secciones.alcance).toBe(false);
  });

  it("en licitación no hay póliza: mandan las bases", () => {
    render(<Prueba inicial={{ segmento: "LICITACION" }} />);
    expect(valores()).not.toContain("Póliza de garantías, exclusiones y vigencia comercial");
  });

  it("sin permiso de edición se leen, no se tocan", () => {
    render(<Prueba editable={false} />);
    expect(screen.getByLabelText("Punto 02 de la portada")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "+ Agregar punto" })).not.toBeInTheDocument();
  });
});
