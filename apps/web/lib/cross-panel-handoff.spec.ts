import { describe, expect, it } from "vitest";
import {
  buildCrossPanelUrl,
  isCrossPanelHref,
  normalizeInternalPanelPath,
  panelIdFromInternalPath,
  resolvePanelId,
} from "./cross-panel-handoff";

describe("panelIdFromInternalPath", () => {
  it("extracts panel from internal paths", () => {
    expect(panelIdFromInternalPath("/erp/notifications-center")).toBe("erp");
    expect(panelIdFromInternalPath("/ops/dispatch?x=1")).toBe("ops");
    expect(panelIdFromInternalPath("/crm")).toBe("crm");
    expect(panelIdFromInternalPath("/dashboard")).toBeNull();
  });
});

describe("resolvePanelId", () => {
  it("maps subdomain aliases", () => {
    expect(resolvePanelId("core")).toBe("erp");
    expect(resolvePanelId("sales")).toBe("crm");
    expect(resolvePanelId("ops")).toBe("ops");
  });
});

describe("isCrossPanelHref", () => {
  it("detects foreign panel hrefs", () => {
    expect(isCrossPanelHref("/ops/dispatch", "crm")).toBe(true);
    expect(isCrossPanelHref("/crm/leads", "crm")).toBe(false);
    expect(isCrossPanelHref("/dashboard", "erp")).toBe(false);
  });
});

describe("normalizeInternalPanelPath", () => {
  it("keeps same-panel paths", () => {
    expect(normalizeInternalPanelPath("erp", "/erp/notifications-center")).toBe(
      "/erp/notifications-center",
    );
  });
});

describe("buildCrossPanelUrl dentro del mismo subdominio", () => {
  /**
   * Regresion real: las catorce secciones de contabilidad acababan en la
   * pizarra. El enlace devolvia la ruta SIN el prefijo del panel
   * (`/erp/contabilidad/movimientos` -> `/contabilidad/movimientos`), porque
   * asumia que cada subdominio servia su panel desde la raiz. Hoy todo vive en
   * `core` bajo `/erp/...` y la ruta pelada responde 307 al inicio.
   */
  const originalLocation = window.location;

  function enCore(fn: () => void) {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        protocol: "https:",
        hostname: "core.nexara.com.mx",
        port: "",
      } as Location,
    });
    try {
      fn();
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  }

  it("conserva el prefijo del panel, no lo quita", () => {
    enCore(() => {
      expect(buildCrossPanelUrl("erp", "/erp/contabilidad/movimientos", null)).toBe(
        "/erp/contabilidad/movimientos",
      );
      expect(buildCrossPanelUrl("erp", "/erp/contabilidad", null)).toBe("/erp/contabilidad");
    });
  });

  it("no manda a la pizarra una seccion que existe", () => {
    enCore(() => {
      for (const ruta of [
        "/erp/contabilidad/conciliacion",
        "/erp/contabilidad/cierres",
        "/erp/contabilidad/auditoria",
      ]) {
        expect(buildCrossPanelUrl("erp", ruta, null)).toBe(ruta);
      }
    });
  });
});
