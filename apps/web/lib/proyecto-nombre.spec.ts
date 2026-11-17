import { describe, it, expect } from "vitest";
import { nombreProyectoValido, sugerirNombreProyecto } from "./proyecto-nombre";
describe("nombre descriptivo del proyecto", () => {
  it("rechaza el cliente solo y una palabra de trabajo", () => {
    expect(nombreProyectoValido("ANFORA S.A. de C.V.", "Anfora")).toBe(false);
    expect(nombreProyectoValido("Proyecto de Anfora", "Ánfora")).toBe(false);
    expect(nombreProyectoValido("Instalación de cámaras Anfora", "Ánfora")).toBe(true);
  });
  it("las sugerencias de cada tipo son descriptivas y editables", () => {
    for (const tipo of ["INSTALACION_CCTV", "MANTENIMIENTO", "CONTROL_ACCESO", "OTRO"]) {
      expect(nombreProyectoValido(sugerirNombreProyecto(tipo, "Anfora"), "Anfora")).toBe(true);
    }
  });
});
