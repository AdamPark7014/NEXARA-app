import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverToolRequest } from "./tool-requests-api";

describe("Entregar herramienta (B4, 18-11-2026)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("manda el código de recolección que exige el servidor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await deliverToolRequest("tok", 7, " A1B2 ");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("tool-requests/7/deliver");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ pickupCode: "A1B2" });
  });
});
