import { describe, expect, it } from "vitest";
import { isBranchPortalRoute, usesClientPortalShell } from "./portal-session";

describe("isBranchPortalRoute", () => {
  it("reconoce la sucursal con y sin el prefijo que pone el middleware", () => {
    expect(isBranchPortalRoute("/tickets/sucursal-12")).toBe(true);
    expect(isBranchPortalRoute("/sucursal-12")).toBe(true);
    expect(isBranchPortalRoute("/sucursal-12/")).toBe(true);
  });

  it("no confunde las páginas fijas del portal ni la raíz", () => {
    for (const p of ["/tickets", "/", "", "/mis-servicios", "/tickets/ayuda", "/mis-sucursales"]) {
      expect(isBranchPortalRoute(p)).toBe(false);
    }
    expect(usesClientPortalShell("/mis-servicios")).toBe(true);
  });
});
