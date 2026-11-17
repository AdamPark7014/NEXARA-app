import { describe, expect, it } from "vitest";
import { canOpenPage } from "./page-matrix";
import { ALL_ROLES, ROLES } from "./roles";

describe("ruta de expediente laboral propio o del equipo", () => {
  it.each(ALL_ROLES.filter((rol) => rol !== ROLES.CLIENTE))("%s puede abrir la ficha; la API valida su alcance", (rol) => {
    expect(canOpenPage(rol, "/erp/hr/50")).toBe(true);
  });
  it("no abre el módulo general ni rutas arbitrarias al personal operativo", () => {
    expect(canOpenPage(ROLES.ING_CAMPO, "/erp/hr")).toBe(false);
    expect(canOpenPage(ROLES.ING_CAMPO, "/erp/hr/prenomina")).toBe(false);
    expect(canOpenPage(ROLES.CLIENTE, "/erp/hr/50")).toBe(false);
  });
});
