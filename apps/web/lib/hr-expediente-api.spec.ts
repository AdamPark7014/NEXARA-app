import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmarImportPersonal,
  decidirSolicitudRh,
  obtenerAlertasRh,
  obtenerExpediente,
  previewImportPersonal,
  solicitarCambioRh,
} from "./hr-expediente-api";
import { setActiveCompanyId } from "./tenant";

describe("cliente de expediente RH: empresa, sesión y errores", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response);
    vi.stubGlobal("fetch", fetchMock);
    setActiveCompanyId(42);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it.each([
    ["consultar expediente", () => obtenerExpediente("session-cookie", 50)],
    ["consultar alertas", () => obtenerAlertasRh("session-cookie")],
    ["confirmar importación", () => confirmarImportPersonal("session-cookie", { actualizar: [] })],
    ["solicitar cambio", () => solicitarCambioRh("session-cookie", { userId: 50, tipo: "CAMBIO_PUESTO", valor: "Técnico" })],
    ["decidir solicitud", () => decidirSolicitudRh("session-cookie", 7, false, "Información incompleta")],
  ])("incluye empresa activa y cookie al %s", async (_nombre, consultar) => {
    await consultar();
    const init = fetchMock.mock.calls[0][1]!;
    const headers = new Headers(init.headers);
    expect(init.credentials).toBe("include");
    expect(headers.get("X-Company-Id")).toBe("42");
    expect(headers.get("Authorization")).toBe("Bearer session-cookie");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("cada consulta toma la empresa activa actual", async () => {
    await obtenerExpediente("t", 50);
    setActiveCompanyId(43);
    await obtenerExpediente("t", 50);
    expect(new Headers(fetchMock.mock.calls[0][1]!.headers).get("X-Company-Id")).toBe("42");
    expect(new Headers(fetchMock.mock.calls[1][1]!.headers).get("X-Company-Id")).toBe("43");
  });

  it("el Excel conserva multipart sin imponer Content-Type JSON", async () => {
    const file = new File(["archivo ficticio"], "personal.xlsx");
    await previewImportPersonal("session-cookie", file);
    const init = fetchMock.mock.calls[0][1]!;
    const headers = new Headers(init.headers);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(headers.get("X-Company-Id")).toBe("42");
    expect(headers.get("Authorization")).toBe("Bearer session-cookie");
    expect(headers.has("Content-Type")).toBe(false);
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);
  });

  it("muestra el mensaje español del servidor sin el envoltorio JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 403,
      text: async () => JSON.stringify({ message: "Solo RH o dirección pueden importar personal." }),
    } as Response);
    await expect(obtenerExpediente("t", 50)).rejects.toThrow("Solo RH o dirección pueden importar personal.");
  });

  it("sustituye HTML de un proxy por un error claro en español", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => "<html>Bad gateway</html>" } as Response);
    await expect(obtenerExpediente("t", 50)).rejects.toThrow("No se pudo completar la operación de RH.");
  });
});
