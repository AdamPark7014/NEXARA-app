import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

/**
 * 14-11-2026: el ERP vive solo en app.nexara.com.mx. Adam cambió core → app en el DNS y
 * borró los demás subdominios de páginas. Antes app. redirigía a core. (que ya no resuelve)
 * y el ERP no abría.
 */
const pedir = (url: string) =>
  middleware(new NextRequest(url, { headers: { host: new URL(url).host } })) as Response;

describe("middleware · el ERP vive solo en app.nexara.com.mx", () => {
  it("app. no se redirige a ningún otro subdominio", () => {
    for (const ruta of ["/", "/login", "/erp/pizarra", "/erp/actividades/12"]) {
      const res = pedir(`https://app.nexara.com.mx${ruta}`);
      const destino = res.headers.get("location");
      if (destino) expect(new URL(destino).hostname).toBe("app.nexara.com.mx");
    }
  });

  it("core. y los alias viejos mandan a app. conservando la ruta", () => {
    for (const host of ["core", "console", "consola", "sales", "ops", "portal"]) {
      const res = pedir(`https://${host}.nexara.com.mx/erp/pizarra`);
      expect([307, 308]).toContain(res.status);
      const destino = new URL(res.headers.get("location") ?? "");
      expect(destino.hostname).toBe("app.nexara.com.mx");
    }
    const res = pedir("https://core.nexara.com.mx/erp/actividades/12/evidencias");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://app.nexara.com.mx/erp/actividades/12/evidencias");
  });
});
