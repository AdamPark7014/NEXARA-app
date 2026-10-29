import { describe, expect, it } from "vitest";
import { conOrigen, leerOrigen, parametrosDeOrigen, regresoDeOrigen } from "./actividad-origen";

/**
 * «‹ regresar» desde una actividad vuelve a donde se abrió (pedido de Adam, 28-10): a «En espera
 * de revisión» o al historial de la persona, nunca a la lista general de Actividades.
 */
describe("leerOrigen", () => {
  it("revisión y revisadas no necesitan más datos", () => {
    expect(leerOrigen("?origen=revision")).toEqual({ tipo: "revision" });
    expect(leerOrigen("origen=revisadas")).toEqual({ tipo: "revisadas" });
  });

  it("el historial y la ficha llevan a la persona", () => {
    expect(leerOrigen("?origen=historial&persona=12")).toEqual({ tipo: "historial", persona: 12 });
    expect(leerOrigen(new URLSearchParams("origen=persona&persona=5"))).toEqual({ tipo: "persona", persona: 5 });
  });

  it("sin persona válida, o con un origen que no existe, no hay origen", () => {
    expect(leerOrigen("?origen=historial")).toBeNull();
    expect(leerOrigen("?origen=historial&persona=abc")).toBeNull();
    expect(leerOrigen("?origen=historial&persona=0")).toBeNull();
    expect(leerOrigen("?origen=pizarra")).toBeNull();
    expect(leerOrigen("?activityId=7")).toBeNull();
    expect(leerOrigen("")).toBeNull();
    expect(leerOrigen(null)).toBeNull();
  });
});

describe("conOrigen", () => {
  it("agrega el origen antes del ancla", () => {
    expect(conOrigen("/erp/actividades/5/evidencias#revision", { tipo: "revision" })).toBe(
      "/erp/actividades/5/evidencias?origen=revision#revision",
    );
  });

  it("respeta lo que el enlace ya trae y no duplica el origen", () => {
    expect(conOrigen("/erp/actividades/5?activityId=5", { tipo: "historial", persona: 9 })).toBe(
      "/erp/actividades/5?activityId=5&origen=historial&persona=9",
    );
    expect(conOrigen("/erp/actividades/5?origen=revision", { tipo: "revisadas" })).toBe(
      "/erp/actividades/5?origen=revisadas",
    );
    expect(conOrigen("/erp/actividades/5?origen=historial&persona=9", { tipo: "revision" })).toBe(
      "/erp/actividades/5?origen=revision",
    );
  });

  it("sin origen deja el enlace igual", () => {
    expect(conOrigen("/erp/actividades/5/historial", null)).toBe("/erp/actividades/5/historial");
    expect(parametrosDeOrigen(undefined)).toEqual([]);
  });

  it("ida y vuelta: lo que escribe es lo que lee", () => {
    const origenes = [
      { tipo: "revision" as const },
      { tipo: "revisadas" as const },
      { tipo: "historial" as const, persona: 31 },
      { tipo: "persona" as const, persona: 4 },
    ];
    for (const o of origenes) {
      const href = conOrigen("/erp/actividades/1/evidencias#revision", o);
      expect(leerOrigen(href.slice(href.indexOf("?"), href.indexOf("#")))).toEqual(o);
    }
  });
});

describe("regresoDeOrigen", () => {
  it("desde «En espera de revisión» vuelve a esa pestaña", () => {
    expect(regresoDeOrigen({ tipo: "revision" })).toEqual({
      href: "/erp/pizarra?vista=revision",
      label: "En espera de revisión",
    });
  });

  it("desde lo ya revisado vuelve a «Revisadas»", () => {
    expect(regresoDeOrigen({ tipo: "revisadas" }).href).toBe("/erp/pizarra?vista=revision&ver=revisadas");
  });

  it("desde el historial de alguien vuelve a su historial, con su nombre de pila", () => {
    expect(regresoDeOrigen({ tipo: "historial", persona: 12 }, "Iván Domínguez")).toEqual({
      href: "/erp/pizarra/12?pestana=historial",
      label: "Historial de Iván",
    });
    expect(regresoDeOrigen({ tipo: "historial", persona: 12 }).label).toBe("Historial");
  });

  it("desde la ficha (Ahora) vuelve a la ficha", () => {
    expect(regresoDeOrigen({ tipo: "persona", persona: 3 }, "Josué")).toEqual({ href: "/erp/pizarra/3", label: "Josué" });
  });

  it("sin origen (pizarra, Mis actividades) sigue volviendo a la pizarra", () => {
    expect(regresoDeOrigen(null)).toEqual({ href: "/erp/pizarra", label: "Pizarra" });
  });
});
