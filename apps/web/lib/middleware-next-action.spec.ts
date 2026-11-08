import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

describe("middleware · Server Actions de escáneres", () => {
  it("responde 404 a un POST con Next-Action (la app no tiene Server Actions)", () => {
    const req = new NextRequest("https://nexara.com.mx/", { method: "POST", headers: { "next-action": "x" } });
    const res = middleware(req) as Response;
    expect(res.status).toBe(404);
  });
});
