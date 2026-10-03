import { describe, expect, it } from "vitest";
import {
  MENSAJE_TOPE_12H,
  errorMotivoPausa,
  puedePausar,
  puedeReanudar,
  textoPausa,
  toparDuracion,
} from "./sesion-actividad";

describe("texto de la pausa", () => {
  it("sin pausa no dice nada", () => {
    expect(textoPausa({ enPausa: false })).toBeNull();
    expect(textoPausa({})).toBeNull();
  });

  it("pausada por el jefe: quién y por qué", () => {
    expect(
      textoPausa(
        { enPausa: true, pausaTipo: "PAUSA", pausadaPor: { id: 1, nombre: "Christian Del Pozo" }, motivoPausa: "Atiende la falla urgente" },
        { miId: 13 },
      ),
    ).toBe("La pausó Christian Del: Atiende la falla urgente");
  });

  it("pausada por uno mismo", () => {
    expect(textoPausa({ enPausa: true, pausaTipo: "PAUSA", pausadaPor: { id: 13, nombre: "Joan" } }, { miId: 13 })).toBe(
      "La pausaste.",
    );
  });

  it("detenida por la salida, las 12 horas o el fin del día", () => {
    expect(textoPausa({ enPausa: true, pausaTipo: "SALIDA" })).toBe("Se detuvo al marcar tu salida.");
    expect(textoPausa({ enPausa: true, pausaTipo: "SALIDA" }, { propia: false })).toBe("Se detuvo al marcar su salida.");
    expect(textoPausa({ enPausa: true, pausaTipo: "TOPE_12H" })).toBe("Se detuvo sola al cumplir 12 horas.");
    expect(textoPausa({ enPausa: true, pausaTipo: "CORTE_DIA" })).toBe("Se detuvo sola al terminar el día.");
  });
});

describe("qué botón se pinta", () => {
  it("Reanudar: solo con el reloj detenido, a quien ejecuta y con la actividad abierta", () => {
    expect(puedeReanudar({ enPausa: true, estatus: "En Proceso" })).toBe(true);
    expect(puedeReanudar({ enPausa: true, despachador: true })).toBe(false);
    expect(puedeReanudar({ enPausa: true, estatus: "Finalizada" })).toBe(false);
    expect(puedeReanudar({ enCurso: true })).toBe(false);
    // API anterior: no manda los campos, no se pinta nada.
    expect(puedeReanudar({})).toBe(false);
  });

  it("Pausar: solo mientras corre", () => {
    expect(puedePausar({ enCurso: true, estatus: "En Proceso" })).toBe(true);
    expect(puedePausar({ enCurso: false })).toBe(false);
    expect(puedePausar({ enCurso: true, estatus: "Aprobada" })).toBe(false);
  });
});

describe("motivo del jefe", () => {
  it("pide al menos 10 caracteres", () => {
    expect(errorMotivoPausa("urgente")).toMatch(/mínimo 10/);
    expect(errorMotivoPausa("   ")).toMatch(/mínimo 10/);
    expect(errorMotivoPausa("Salió una falla en el cliente")).toBeNull();
    expect(errorMotivoPausa("x".repeat(501))).toMatch(/500/);
  });
});

describe("la rueda no pasa de 12 horas", () => {
  it("12 h 30 min se queda en 12 h; lo demás no cambia", () => {
    expect(toparDuracion(12, 30)).toEqual({ horas: 12, minutos: 0 });
    expect(toparDuracion(13, 0)).toEqual({ horas: 12, minutos: 0 });
    expect(toparDuracion(2, 45)).toEqual({ horas: 2, minutos: 45 });
    expect(toparDuracion(0, 0)).toEqual({ horas: 0, minutos: 0 });
  });

  it("el mensaje es el que pidió el dueño", () => {
    expect(MENSAJE_TOPE_12H).toBe("Una actividad no puede durar más de 12 horas. Si lleva más días, se reanuda cada día.");
  });
});
