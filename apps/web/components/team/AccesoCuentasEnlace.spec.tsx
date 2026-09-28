import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const useUser = vi.hoisted(() => vi.fn());
vi.mock("@/components/UserContext", () => ({ useUser }));
const puedeEntrarACuentas = vi.hoisted(() => vi.fn());
vi.mock("@/lib/account-access-api", () => ({ puedeEntrarACuentas }));

import AccesoCuentasEnlace from "./AccesoCuentasEnlace";

afterEach(() => vi.clearAllMocks());

describe("AccesoCuentasEnlace", () => {
  it("el dueño ve el botón", async () => {
    useUser.mockReturnValue({ token: "t" });
    puedeEntrarACuentas.mockResolvedValue(true);
    render(<AccesoCuentasEnlace />);
    expect(await screen.findByRole("button", { name: "Acceso a cuentas" })).toBeTruthy();
  });

  it("cualquier otra persona no ve nada", async () => {
    useUser.mockReturnValue({ token: "t" });
    puedeEntrarACuentas.mockResolvedValue(false);
    const { container } = render(<AccesoCuentasEnlace />);
    await waitFor(() => expect(puedeEntrarACuentas).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("sin sesión ni siquiera consulta", () => {
    useUser.mockReturnValue({ token: null });
    render(<AccesoCuentasEnlace />);
    expect(puedeEntrarACuentas).not.toHaveBeenCalled();
  });
});
