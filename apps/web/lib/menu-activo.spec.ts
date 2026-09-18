import { describe, expect, it } from "vitest";
import { rutaActivaDelMenu } from "./menu-activo";

const MENU = ["/erp/pizarra", "/erp/asistencias", "/erp/asistencias/indicadores", "/erp/cotizaciones"];

describe("rutaActivaDelMenu", () => {
  it("en los KPIs solo se marca «KPIs del equipo», no también Asistencias", () => {
    expect(rutaActivaDelMenu("/erp/asistencias/indicadores", MENU)).toBe("/erp/asistencias/indicadores");
    expect(rutaActivaDelMenu("/erp/asistencias/indicadores/12", MENU)).toBe("/erp/asistencias/indicadores");
  });

  it("en Asistencias y sus subpáginas propias se marca Asistencias", () => {
    expect(rutaActivaDelMenu("/erp/asistencias", MENU)).toBe("/erp/asistencias");
    expect(rutaActivaDelMenu("/erp/asistencias/historial", MENU)).toBe("/erp/asistencias");
  });

  it("un prefijo de texto no cuenta como subpágina", () => {
    expect(rutaActivaDelMenu("/erp/asistencias-extra", MENU)).toBeNull();
  });

  it("sin ruta no hay nada activo", () => {
    expect(rutaActivaDelMenu(null, MENU)).toBeNull();
  });
});
