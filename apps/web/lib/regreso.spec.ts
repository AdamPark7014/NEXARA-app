import { describe, expect, it } from "vitest";
import { conRegreso, etiquetaDeRegreso, filtrosAlAbrir, leerRegreso, rutaDeRegresoValida } from "./regreso";

describe("regreso", () => {
  it("solo acepta rutas de /erp", () => {
    expect(rutaDeRegresoValida("/erp/proyectos/5")).toBe("/erp/proyectos/5");
    expect(rutaDeRegresoValida("/erp?x=1")).toBe("/erp?x=1");
    expect(rutaDeRegresoValida("https://evil.test/erp")).toBeNull();
    expect(rutaDeRegresoValida("//evil.test/erp")).toBeNull();
    expect(rutaDeRegresoValida("/erp//evil.test")).toBeNull();
    expect(rutaDeRegresoValida("/erp\\evil")).toBeNull();
    expect(rutaDeRegresoValida("/erpx")).toBeNull();
    expect(rutaDeRegresoValida("/ops/projects")).toBeNull();
    expect(rutaDeRegresoValida("")).toBeNull();
    expect(rutaDeRegresoValida(null)).toBeNull();
  });

  it("lleva de dónde se viene, con sus filtros, sin perder query ni ancla", () => {
    expect(conRegreso("/erp/actividades/5", "/erp/proyectos/7")).toBe("/erp/actividades/5?volver=%2Ferp%2Fproyectos%2F7");
    expect(conRegreso("/erp/clientes/3#proyectos", "/erp/cotizaciones?q=hola")).toBe("/erp/clientes/3?volver=%2Ferp%2Fcotizaciones%3Fq%3Dhola#proyectos");
    expect(conRegreso("/erp/x?a=1", "/erp/y")).toBe("/erp/x?a=1&volver=%2Ferp%2Fy");
    expect(conRegreso("/erp/x", "")).toBe("/erp/x");
    expect(conRegreso("/erp/x", "https://evil.test")).toBe("/erp/x");
  });

  it("de ida y vuelta, y nombra su destino", () => {
    const enlace = conRegreso("/erp/actividades/5", "/erp/asistencias/indicadores/9?desde=2026-10-01");
    expect(leerRegreso(enlace.split("?")[1])).toEqual({ href: "/erp/asistencias/indicadores/9?desde=2026-10-01", label: "Desempeño" });
    expect(leerRegreso("?volver=https://evil.test")).toBeNull();
    expect(leerRegreso(null)).toBeNull();
    expect(etiquetaDeRegreso("/erp/proyectos/5")).toBe("Proyecto");
    expect(etiquetaDeRegreso("/erp/proyectos?estado=ACTIVE")).toBe("Proyectos");
    expect(etiquetaDeRegreso("/erp/cotizaciones/5")).toBe("Cotización");
    expect(etiquetaDeRegreso("/erp/hr/kpis")).toBe("KPIs de RH");
    expect(etiquetaDeRegreso("/erp/otra")).toBe("Regresar");
  });

  it("al abrir, un enlace con filtros manda sobre lo guardado; sin ellos, regresa lo guardado", () => {
    const claves = ["q", "estado"];
    const guardado = JSON.stringify({ q: "biblioteca", estado: "ACTIVE", otro: "x" });
    expect(filtrosAlAbrir(claves, "?estado=DONE", guardado)).toEqual({ estado: "DONE" });
    expect(filtrosAlAbrir(claves, "", guardado)).toEqual({ q: "biblioteca", estado: "ACTIVE" });
    expect(filtrosAlAbrir(claves, "?vista=clientes", guardado)).toEqual({ q: "biblioteca", estado: "ACTIVE" });
    expect(filtrosAlAbrir(claves, "", JSON.stringify({ q: null, estado: "" }))).toEqual({});
    expect(filtrosAlAbrir(claves, "", "no es json")).toEqual({});
    expect(filtrosAlAbrir(claves, "", null)).toEqual({});
  });
});
