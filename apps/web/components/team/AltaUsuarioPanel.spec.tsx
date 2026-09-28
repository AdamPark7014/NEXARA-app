import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AltaUsuarioPanel from "./AltaUsuarioPanel";

const useUser = vi.hoisted(() => vi.fn());
vi.mock("@/components/UserContext", () => ({ useUser }));

const SOPORTE = { roleKey: "ing_soporte", etiqueta: "Soporte" };
const INSTALADOR = { roleKey: "ing_campo", etiqueta: "Instalador" };

function respuestas(tipos: unknown, alta?: () => unknown) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("users/delegated/roles")) return { ok: true, json: async () => tipos };
    if (init?.method === "POST") {
      const r = alta ? alta() : { ok: true, cuerpo: { id: 9, nombre: "Persona Nueva", email: "nueva@nexara.com.mx", roleKey: "ing_soporte", departmentId: 1, employeeNumber: null, managerId: 2 } };
      return { ok: (r as any).ok, json: async () => (r as any).cuerpo };
    }
    return { ok: false, json: async () => ({}) };
  });
}

beforeEach(() => useUser.mockReturnValue({ token: "tok", user: { id: 2 } }));
afterEach(() => vi.unstubAllGlobals());

describe("AltaUsuarioPanel", () => {
  it("sin permiso (lista vacía) no muestra nada", async () => {
    const f = respuestas([]);
    vi.stubGlobal("fetch", f);
    const { container } = render(<AltaUsuarioPanel />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(container.textContent).toBe("");
    expect(screen.queryByRole("button", { name: /dar de alta/i })).toBeNull();
  });

  it("con permiso muestra los tipos que puede dar de alta y el botón", async () => {
    vi.stubGlobal("fetch", respuestas([SOPORTE, INSTALADOR]));
    render(<AltaUsuarioPanel />);
    expect(await screen.findByRole("button", { name: "Dar de alta a alguien" })).toBeTruthy();
    expect(screen.getByText("Soporte, Instalador")).toBeTruthy();
  });

  it("da de alta con un solo tipo (queda elegido), manda el alta y muestra la contraseña una vez", async () => {
    const f = respuestas([SOPORTE]);
    vi.stubGlobal("fetch", f);
    render(<AltaUsuarioPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Dar de alta a alguien" }));

    const dialogo = await screen.findByRole("dialog");
    await userEvent.type(within(dialogo).getByLabelText("Nombre completo"), "Persona Nueva");
    await userEvent.type(within(dialogo).getByLabelText("Correo"), "nueva@nexara.com.mx");
    const clave = (within(dialogo).getByLabelText(/^Contraseña/) as HTMLInputElement).value;
    expect(clave.length).toBeGreaterThanOrEqual(10); // ya viene generada
    await userEvent.click(within(dialogo).getByRole("button", { name: "Crear usuario" }));

    await screen.findByText(/ya puede entrar como Soporte/);
    expect(screen.getByText("nueva@nexara.com.mx")).toBeTruthy();
    expect(screen.getByText(clave)).toBeTruthy();
    expect(screen.getByText(/única vez que se muestra/)).toBeTruthy();

    const post = (f.mock.calls as unknown as Array<[string, RequestInit]>).find(([, i]) => i?.method === "POST")!;
    expect(JSON.parse(String(post[1].body))).toEqual({ nombre: "Persona Nueva", email: "nueva@nexara.com.mx", password: clave, roleKey: "ing_soporte" });
  });

  it("con varios tipos obliga a elegir uno antes de poder crear", async () => {
    vi.stubGlobal("fetch", respuestas([SOPORTE, INSTALADOR]));
    render(<AltaUsuarioPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Dar de alta a alguien" }));
    const dialogo = await screen.findByRole("dialog");
    await userEvent.type(within(dialogo).getByLabelText("Nombre completo"), "Persona Nueva");
    await userEvent.type(within(dialogo).getByLabelText("Correo"), "nueva@nexara.com.mx");
    expect((within(dialogo).getByRole("button", { name: "Crear usuario" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.selectOptions(within(dialogo).getByLabelText("Tipo de usuario"), "ing_campo");
    expect((within(dialogo).getByRole("button", { name: "Crear usuario" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("si el API rechaza el alta, muestra el motivo y deja corregir", async () => {
    vi.stubGlobal("fetch", respuestas([SOPORTE], () => ({ ok: false, cuerpo: { message: "El correo ya está registrado (Otra Persona)." } })));
    render(<AltaUsuarioPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Dar de alta a alguien" }));
    const dialogo = await screen.findByRole("dialog");
    await userEvent.type(within(dialogo).getByLabelText("Nombre completo"), "Persona Nueva");
    await userEvent.type(within(dialogo).getByLabelText("Correo"), "repetido@nexara.com.mx");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Crear usuario" }));
    expect(await screen.findByText("El correo ya está registrado (Otra Persona).")).toBeTruthy();
    expect(within(dialogo).getByRole("button", { name: "Crear usuario" })).toBeTruthy();
  });
});
