import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./api-base";
import { acceptAllConsent, getCookieConsent, hasAnalyticsConsent, setCookieConsent } from "./cookie-consent";
import { getActiveCompanyId, setActiveCompanyId, withTenantHeaders } from "./tenant";

/** Navegador con las cookies y los datos del sitio bloqueados: hasta leer `window.localStorage` lanza. */
describe("almacenamiento bloqueado", () => {
  beforeEach(() => {
    for (const almacen of ["localStorage", "sessionStorage"] as const) {
      vi.spyOn(window, almacen, "get").mockImplementation(() => {
        throw new DOMException("denegado", "SecurityError");
      });
    }
  });
  afterEach(() => vi.restoreAllMocks());

  it("la empresa activa se lee y se cambia sin tronar", () => {
    expect(getActiveCompanyId()).toBeNull();
    expect(() => setActiveCompanyId(3)).not.toThrow();
    expect(withTenantHeaders({ a: "b" })).toEqual({ a: "b" });
  });

  it("las llamadas a la API salen", async () => {
    const fetchFalso = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await expect(apiRequest("x")).resolves.toBeInstanceOf(Response);
    expect(fetchFalso).toHaveBeenCalledOnce();
  });

  it("la decisión de cookies dura la visita y avisa a la página", () => {
    expect(getCookieConsent()).toBeNull();
    const alDecidir = vi.fn();
    window.addEventListener("nexara-cookie-consent", alDecidir);
    setCookieConsent(acceptAllConsent());
    window.removeEventListener("nexara-cookie-consent", alDecidir);
    expect(alDecidir).toHaveBeenCalledOnce();
    expect(hasAnalyticsConsent()).toBe(true);
  });
});
