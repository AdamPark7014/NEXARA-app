import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import TuDiaPanel, { type TuDia } from "./TuDiaPanel";

// Los enlaces de Core (`CrossPanelLink`) leen la sesión y la ruta actual.
vi.mock("@/components/UserContext", () => ({ useUser: () => ({ user: null }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/erp/executive", useRouter: () => ({ push: vi.fn() }) }));

const RESUMEN: TuDia = {
  fecha: "2026-09-28",
  vacio: false,
  prioridad: "alta",
  titulo: "Tu día: 3 por aprobar · 2 facturas vencidas",
  mensaje: "",
  items: [
    { clave: "aprobaciones", texto: "3 solicitudes por aprobar ($148,250), la más antigua lleva 4 días", url: "/erp/approvals", tono: "alerta" },
    { clave: "cobranza", texto: "2 facturas vencidas por cobrar ($92,400)", url: "/erp/invoicing", tono: "atencion" },
    { clave: "externo", texto: "Enlace que no es de Core", url: "https://ejemplo.com/x", tono: "info" },
  ],
};

function respuesta(cuerpo: unknown, ok = true, status = 200) {
  return vi.fn(async (url: string) =>
    ({
      ok: String(url).includes("user-preferences") ? true : ok,
      status,
      json: async () => cuerpo,
      text: async () => (String(url).includes("user-preferences") ? "0" : JSON.stringify(cuerpo)),
    }) as unknown as Response,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("TuDiaPanel", () => {
  it("lista lo pendiente en orden y solo enlaza rutas internas de Core", async () => {
    vi.stubGlobal("fetch", respuesta(RESUMEN));
    render(<TuDiaPanel token="tok" />);

    expect(await screen.findByText(/3 solicitudes por aprobar/)).toBeTruthy();
    expect(screen.getByText(/2 facturas vencidas por cobrar/)).toBeTruthy();
    expect(screen.getByText("Urgente")).toBeTruthy();

    const enlaces = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(enlaces).toContain("/erp/invoicing");
    expect(enlaces).not.toContain("https://ejemplo.com/x");
  });

  it("pide el resumen con la sesión del usuario", async () => {
    const f = respuesta(RESUMEN);
    vi.stubGlobal("fetch", f);
    render(<TuDiaPanel token="tok-123" />);
    await screen.findByText(/3 solicitudes/);
    const llamada = (f.mock.calls as unknown as Array<[string, RequestInit]>).find(([u]) => String(u).includes("executive/brief"))!;
    expect((llamada[1].headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  it("sin pendientes dice «Todo al día»", async () => {
    vi.stubGlobal("fetch", respuesta({ ...RESUMEN, vacio: true, items: [], titulo: "Todo al día" }));
    render(<TuDiaPanel token="tok" />);
    expect(await screen.findByText("Todo al día")).toBeTruthy();
  });

  it("si el servicio falla no estorba: el panel no aparece", async () => {
    const f = respuesta({}, false, 500);
    vi.stubGlobal("fetch", f);
    const { container } = render(<TuDiaPanel token="tok" />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("section")).toBeNull());
  });

  it("sin sesión no consulta nada", () => {
    const f = respuesta(RESUMEN);
    vi.stubGlobal("fetch", f);
    const { container } = render(<TuDiaPanel token={null} />);
    expect(f).not.toHaveBeenCalled();
    expect(container.querySelector("section")).toBeNull();
  });

  it("permite elegir «solo el resumen y lo urgente» y lo guarda", async () => {
    const f = respuesta(RESUMEN);
    vi.stubGlobal("fetch", f);
    render(<TuDiaPanel token="tok" />);
    const casilla = (await screen.findByRole("checkbox")) as HTMLInputElement;
    expect(casilla.checked).toBe(false);

    await userEvent.click(casilla);
    expect(casilla.checked).toBe(true);
    await waitFor(() => {
      const put = (f.mock.calls as unknown as Array<[string, RequestInit]>).find(([, i]) => i?.method === "PUT");
      expect(put).toBeTruthy();
      expect(JSON.parse(String(put![1].body))).toEqual({ key: "notificaciones.solo_resumen", value: "1" });
    });
  });
});
