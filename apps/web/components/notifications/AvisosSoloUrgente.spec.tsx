import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AvisosSoloUrgente from "./AvisosSoloUrgente";

function respuesta(valor: string, okPut = true) {
  return vi.fn(async (_url: string, init?: RequestInit) =>
    ({
      ok: init?.method === "PUT" ? okPut : true,
      status: init?.method === "PUT" && !okPut ? 500 : 200,
      text: async () => valor,
      json: async () => ({}),
    }) as unknown as Response,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("AvisosSoloUrgente", () => {
  it("es un interruptor con su explicación y guarda la preferencia", async () => {
    const f = respuesta("0");
    vi.stubGlobal("fetch", f);
    render(<AvisosSoloUrgente token="tok" />);

    const interruptor = (await screen.findByRole("switch", { name: /Recibir solo lo urgente/ })) as HTMLInputElement;
    expect(interruptor.checked).toBe(false);
    expect(screen.getByText(/resumen de cada mañana/)).toBeTruthy();

    await userEvent.click(interruptor);
    expect(interruptor.checked).toBe(true);
    await waitFor(() => {
      const put = (f.mock.calls as unknown as Array<[string, RequestInit]>).find(([, i]) => i?.method === "PUT");
      expect(put).toBeTruthy();
      expect(JSON.parse(String(put![1].body))).toEqual({ key: "notificaciones.solo_resumen", value: "1" });
    });
  });

  it("si no se guarda, vuelve como estaba y lo dice", async () => {
    vi.stubGlobal("fetch", respuesta("1", false));
    render(<AvisosSoloUrgente token="tok" />);
    const interruptor = (await screen.findByRole("switch")) as HTMLInputElement;
    expect(interruptor.checked).toBe(true);

    await userEvent.click(interruptor);
    await waitFor(() => expect(interruptor.checked).toBe(true));
    expect(screen.getByRole("alert").textContent).toMatch(/No se pudo guardar/);
  });

  it("sin sesión no consulta nada", () => {
    const f = respuesta("0");
    vi.stubGlobal("fetch", f);
    const { container } = render(<AvisosSoloUrgente token={null} />);
    expect(f).not.toHaveBeenCalled();
    expect(container.firstChild).toBeNull();
  });
});
