import { describe, expect, it } from "vitest";
import {
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
