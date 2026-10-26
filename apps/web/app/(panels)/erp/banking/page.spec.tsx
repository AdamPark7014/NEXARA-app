import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import BankingPage from "./page";

/** Bancos: qué dice cuando falla la carga, cuando falla la recarga y cuando no trae todos los movimientos. */

const usuario = vi.hoisted(() => ({
  actual: {
    id: 7,
    nombre: "Ada Lovelace",
    email: "ada@nexara.com.mx",
    token: "jwt",
    permissions: [] as string[],
    isSuperAdmin: true,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/erp/banking",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: usuario.actual, token: usuario.actual.token }),
}));

vi.mock("@/lib/use-hidden-modules", () => ({
  useHiddenModuleIds: () => ({ hidden: new Set<string>() }),
}));

const CUENTA = {
  id: 1,
  name: "Operación",
  bankName: "BBVA",
  accountNumber: "0123456789",
  clabe: null,
  currency: "MXN",
  accountType: "CHEQUES",
  currentBalance: 1500,
  isActive: true,
};

function movimientos(pagina: number) {
  return Array.from({ length: 100 }, (_, i) => ({
    id: pagina * 1000 + i,
    transactionDate: "2026-10-01T12:00:00.000Z",
    description: `Movimiento ${pagina}-${i}`,
    amount: 10,
    isDebit: false,
    reconciled: false,
  }));
}

function respuesta(status: number, body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Bancos", () => {
  it("si no carga ninguna cuenta, enseña la causa que manda el servidor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("banking/accounts")
          ? respuesta(403, { message: "No tienes acceso a las cuentas bancarias." })
          : respuesta(200, []),
      ),
    );
    render(<BankingPage />);

    expect(await screen.findByText("No tienes acceso a las cuentas bancarias.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Contabilidad/ })).toHaveAttribute("href", "/erp/contabilidad");
  });

  it("si falla la recarga, avisa que los saldos son los anteriores y por qué", async () => {
    let fallar = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("/transactions")) return respuesta(200, { data: [], meta: { total: 0 } });
        if (u.includes("banking/accounts")) {
          return fallar ? respuesta(503, { message: "El banco no respondió." }) : respuesta(200, [CUENTA]);
        }
        return respuesta(200, []);
      }),
    );
    const user = userEvent.setup();
    render(<BankingPage />);

    expect(await screen.findAllByText("Operación")).not.toHaveLength(0);
    fallar = true;
    await user.click(screen.getByRole("button", { name: "Actualizar" }));

    expect(
      await screen.findByText("No se pudo actualizar; se muestran los saldos anteriores. El banco no respondió."),
    ).toBeInTheDocument();
  });

  it("con más movimientos de los cargados, dice que la búsqueda solo mira los cargados", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        const tx = u.match(/transactions\?limit=100&page=(\d+)/);
        if (tx) return respuesta(200, { data: movimientos(Number(tx[1])), meta: { total: 650 } });
        if (u.includes("banking/accounts")) return respuesta(200, [CUENTA]);
        return respuesta(200, []);
      }),
    );
    render(<BankingPage />);

    await waitFor(() =>
      expect(
        screen.getByText("Se muestran 500 de 650 movimientos; la búsqueda y los filtros solo miran los cargados."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Cargar más" })).toBeInTheDocument();
  });
});
