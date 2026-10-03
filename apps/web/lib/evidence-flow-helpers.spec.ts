import { describe, expect, it } from "vitest";
import { esActividadComercial, evidenceStepsForKind, textosDeInicioYCierre } from "./evidence-flow-helpers";
import { evidenceStepLabel } from "./evidence-lock";

describe("nombres del inicio y del cierre según el tipo de actividad", () => {
  it("en comercial no hay entrada ni salida: inicio y conclusión de actividad", () => {
    const t = textosDeInicioYCierre("comercial");
    expect(t.inicio.nombre).toBe("Inicio de actividad");
    expect(t.cierre.nombre).toBe("Conclusión de actividad");
    expect(t.inicio.paso).toBe("Paso 1: Inicio de actividad");
    expect(t.cierre.paso).toBe("Paso 5: Conclusión de actividad");
    expect(t.inicio.corto).toBe("Inicio");
    expect(t.cierre.corto).toBe("Conclusión");
  });

  it("ningún texto de comercial habla de «sitio», «entrada» ni «salida»", () => {
    const t = textosDeInicioYCierre("COMERCIAL ");
    const todos = [...Object.values(t.inicio), ...Object.values(t.cierre), t.relevo].join(" | ");
    expect(todos).not.toMatch(/sitio|entrada|salida/i);
  });

  it.each(["tarea", "proyecto", "obra", "servicio", null, undefined, ""])(
    "%s conserva su texto de siempre",
    (kind) => {
      const t = textosDeInicioYCierre(kind);
      expect(t.inicio.paso).toBe("Paso 1: Foto de Entrada");
      expect(t.inicio.nombre).toBe("Foto de entrada");
      expect(t.inicio.corto).toBe("Entrada");
      expect(t.cierre.paso).toBe("Paso 5: Foto de Salida");
      expect(t.cierre.nombre).toBe("Foto de salida");
      expect(t.cierre.corto).toBe("Salida");
      expect(t.cierre.descripcion).toContain("en el sitio");
    },
  );

  it("solo cambia el nombre: los pasos de comercial son los mismos que los de una tarea", () => {
    expect(evidenceStepsForKind("comercial")).toEqual(evidenceStepsForKind("tarea"));
    expect(esActividadComercial("comercial")).toBe(true);
    expect(esActividadComercial("servicio")).toBe(false);
  });

  it("la etiqueta del paso (avisos de corrección) también respeta el tipo", () => {
    expect(evidenceStepLabel("ENTRY_PHOTO", "comercial")).toBe("Paso 1: Inicio de actividad");
    expect(evidenceStepLabel("EXIT_PHOTO", "comercial")).toBe("Paso 5: Conclusión de actividad");
    expect(evidenceStepLabel("EVIDENCE_PHOTOS", "comercial")).toBe("Paso 2: Fotos de Evidencia");
    // Sin tipo (o con otro) sigue diciendo lo mismo que antes.
    expect(evidenceStepLabel("ENTRY_PHOTO")).toBe("Paso 1: Foto de Entrada");
    expect(evidenceStepLabel("EXIT_PHOTO", "obra")).toBe("Paso 5: Foto de Salida");
  });
});
