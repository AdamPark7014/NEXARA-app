import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/UserContext", () => ({ useUser: () => ({ token: "tok" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const cargarContextoAlta = vi.hoisted(() => vi.fn());
vi.mock("@/lib/delegated-users-api", () => ({ cargarContextoAlta }));
const puedeEntrarACuentas = vi.hoisted(() => vi.fn());
vi.mock("@/lib/account-access-api", () => ({ puedeEntrarACuentas }));

import PerfilesPage from "./page";

const CONTEXTO_VACIO = {
  formulario: "basico",
  tipos: [],
  rolAutomatico: false,
  jefeAutomatico: true,
  telefonoObligatorio: true,
  puede: false,
  departamentos: [],
  jefes: [],
  equipo: [],
};

beforeEach(() => puedeEntrarACuentas.mockResolvedValue(false));
afterEach(() => vi.clearAllMocks());

describe("Perfiles", () => {
  it("sin permiso muestra el aviso, no el panel de alta", async () => {
    cargarContextoAlta.mockResolvedValue(CONTEXTO_VACIO);
    render(<PerfilesPage />);
    expect(await screen.findByText("Aquí no hay nada para ti todavía")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dar de alta a alguien" })).toBeNull();
  });

  it("con permiso muestra el panel de alta y el título de la página", async () => {
    cargarContextoAlta.mockResolvedValue({
      ...CONTEXTO_VACIO,
      puede: true,
      tipos: [{ roleKey: "ing_soporte", etiqueta: "Soporte" }],
    });
    render(<PerfilesPage />);
    expect(screen.getByRole("heading", { name: "Perfiles" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Dar de alta a alguien" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Aquí no hay nada para ti todavía")).toBeNull());
  });

  it("«Acceso a cuentas» no aparece para quien no es el dueño", async () => {
    cargarContextoAlta.mockResolvedValue({ ...CONTEXTO_VACIO, puede: true, tipos: [{ roleKey: "ing_soporte", etiqueta: "Soporte" }] });
    render(<PerfilesPage />);
    await waitFor(() => expect(puedeEntrarACuentas).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Acceso a cuentas" })).toBeNull();
  });

  it("«Acceso a cuentas» aparece para el dueño", async () => {
    puedeEntrarACuentas.mockResolvedValue(true);
    cargarContextoAlta.mockResolvedValue({ ...CONTEXTO_VACIO, puede: true, tipos: [{ roleKey: "dir_admin", etiqueta: "Directores" }] });
    render(<PerfilesPage />);
    expect(await screen.findByRole("button", { name: "Acceso a cuentas" })).toBeTruthy();
  });
});
