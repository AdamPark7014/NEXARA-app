import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/UserContext", () => ({ useUser: () => ({ token: "tok-sesion" }) }));

const api = vi.hoisted(() => ({
  estadoCuentas: vi.fn(),
  desbloquearCuentas: vi.fn(),
  listarCuentas: vi.fn(),
  restablecerContrasena: vi.fn(),
  revelarContrasena: vi.fn(),
}));
vi.mock("@/lib/account-access-api", () => api);

import AccesoCuentasPage from "./page";

const CUENTAS = [
  { id: 2, nombre: "José Antonio Ramírez", email: "jose.ramirez@nexara.com.mx", roleKey: "ing_soporte", isActive: true, passwordChangedAt: null, guardada: true, guardadaEl: "2026-09-28T12:00:00.000Z" },
  { id: 3, nombre: "David Morales", email: "operaciones@nexara.com.mx", roleKey: "ing_campo", isActive: true, passwordChangedAt: "2026-09-01T00:00:00.000Z", guardada: false, guardadaEl: null },
];

beforeEach(() => {
  api.estadoCuentas.mockResolvedValue({ puedeEntrar: true, bovedaLista: true });
  api.desbloquearCuentas.mockResolvedValue({ ficha: "ficha-abc", venceEn: new Date(Date.now() + 5 * 60_000).toISOString() });
  api.listarCuentas.mockResolvedValue(CUENTAS);
  api.restablecerContrasena.mockResolvedValue({ id: 2, nombre: "José Antonio Ramírez", email: "jose.ramirez@nexara.com.mx", password: "Kp7mWq3xTz9Rvb" });
  api.revelarContrasena.mockResolvedValue({ id: 2, nombre: "José Antonio Ramírez", email: "jose.ramirez@nexara.com.mx", password: "Guardada-Prueba-8888" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function entrar() {
  render(<AccesoCuentasPage />);
  await escribirYEntrar("MiClaveDeDueno9");
  await screen.findByText("José Antonio Ramírez");
}

async function escribirYEntrar(clave: string) {
  const campo = await screen.findByLabelText(/Tu contraseña/);
  fireEvent.change(campo, { target: { value: clave } });
  await waitFor(() => expect((screen.getByRole("button", { name: "Entrar" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("Acceso a cuentas", () => {
  it("quien no es el dueño solo ve el aviso y nunca el formulario", async () => {
    api.estadoCuentas.mockResolvedValue({ puedeEntrar: false, bovedaLista: false });
    render(<AccesoCuentasPage />);
    expect(await screen.findByText("Solo para el dueño")).toBeTruthy();
    expect(screen.queryByLabelText(/Tu contraseña/)).toBeNull();
  });

  it("pide la contraseña, la manda una vez, la borra del campo y lista las cuentas con la ficha", async () => {
    await entrar();
    expect(api.desbloquearCuentas).toHaveBeenCalledWith("tok-sesion", "MiClaveDeDueno9");
    expect(api.listarCuentas).toHaveBeenCalledWith("tok-sesion", "ficha-abc");
    expect(screen.getByText("David Morales")).toBeTruthy();
    expect(screen.getByText(/Cerrar acceso \(\d:\d\d\)/)).toBeTruthy();
  });

  it("contraseña equivocada: muestra el error y se queda en el formulario", async () => {
    api.desbloquearCuentas.mockRejectedValue(new Error("La contraseña no es correcta."));
    render(<AccesoCuentasPage />);
    await escribirYEntrar("mala");
    expect(await screen.findByText("La contraseña no es correcta.")).toBeTruthy();
    expect(api.listarCuentas).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/Tu contraseña/) as HTMLInputElement).value).toBe("");
  });

  it("«Ver contraseña» solo aparece en las cuentas que la tienen guardada y la muestra", async () => {
    await entrar();
    expect(screen.getAllByRole("button", { name: "Ver contraseña" })).toHaveLength(1);
    expect(screen.getByText(/sin contraseña guardada/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver contraseña" }));
    expect(await screen.findByText("Guardada-Prueba-8888")).toBeTruthy();
    expect(api.revelarContrasena).toHaveBeenCalledWith("tok-sesion", "ficha-abc", 2);
    expect(screen.getByText(/Se oculta sola en 30 segundos/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(screen.queryByText("Guardada-Prueba-8888")).toBeNull();
  });

  it("la contraseña a la vista se oculta sola a los 30 segundos", async () => {
    await entrar();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Ver contraseña" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("Guardada-Prueba-8888")).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(30_500);
    });
    expect(screen.queryByText("Guardada-Prueba-8888")).toBeNull();
  });

  it("si la bóveda no tiene esa contraseña, muestra el motivo que da el servidor", async () => {
    api.revelarContrasena.mockRejectedValue(new Error("Esa cuenta no tiene una contraseña guardada."));
    await entrar();
    fireEvent.click(screen.getByRole("button", { name: "Ver contraseña" }));
    expect(await screen.findByText("Esa cuenta no tiene una contraseña guardada.")).toBeTruthy();
  });

  it("restablecer pide confirmación y muestra la contraseña nueva, que se puede ocultar", async () => {
    await entrar();
    fireEvent.click(screen.getAllByRole("button", { name: "Restablecer contraseña" })[0]!);
    // Aún no se ha llamado: primero confirma.
    expect(api.restablecerContrasena).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, restablecer" }));
    expect(await screen.findByText("Kp7mWq3xTz9Rvb")).toBeTruthy();
    expect(api.restablecerContrasena).toHaveBeenCalledWith("tok-sesion", "ficha-abc", 2);
    expect(screen.getByText(/Contraseña nueva de/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(screen.queryByText("Kp7mWq3xTz9Rvb")).toBeNull();
  });

  it("cancelar la confirmación no restablece nada", async () => {
    await entrar();
    fireEvent.click(screen.getAllByRole("button", { name: "Restablecer contraseña" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(api.restablecerContrasena).not.toHaveBeenCalled();
  });

  it("la búsqueda filtra por nombre, correo o tipo", async () => {
    await entrar();
    fireEvent.change(screen.getByLabelText("Buscar cuenta"), { target: { value: "ing_campo" } });
    expect(screen.queryByText("José Antonio Ramírez")).toBeNull();
    expect(screen.getByText("David Morales")).toBeTruthy();
  });

  it("«Cerrar acceso» vuelve a pedir la contraseña y olvida la lista y la contraseña a la vista", async () => {
    await entrar();
    fireEvent.click(screen.getByRole("button", { name: "Ver contraseña" }));
    await screen.findByText("Guardada-Prueba-8888");
    fireEvent.click(screen.getByRole("button", { name: /Cerrar acceso/ }));
    expect(await screen.findByLabelText(/Tu contraseña/)).toBeTruthy();
    expect(screen.queryByText("David Morales")).toBeNull();
    expect(screen.queryByText("Guardada-Prueba-8888")).toBeNull();
  });

  it("sin llave de cifrado en el servidor avisa que no se guardan ni se muestran contraseñas", async () => {
    api.estadoCuentas.mockResolvedValue({ puedeEntrar: true, bovedaLista: false });
    render(<AccesoCuentasPage />);
    expect(await screen.findByText(/no tiene llave de cifrado/)).toBeTruthy();
  });
});
