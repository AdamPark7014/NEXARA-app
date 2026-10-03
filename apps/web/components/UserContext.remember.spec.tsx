import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserProvider, useUser } from "./UserContext";

const KEY = "nexara_user";
const futuro = new Date(Date.now() + 20 * 86_400_000).toISOString();

/** Sesión que se guardó al entrar con «Recordarme» (lo que queda tras cerrar el navegador). */
const recordada = {
  id: 7,
  nombre: "Luis",
  email: "luis@nexara.com.mx",
  role: "Encargado",
  token: "cabecera.cuerpo.firma",
  expiresAt: futuro,
  permissions: [],
  remember: true,
};

function Mira() {
  const { user } = useUser();
  return <span data-testid="u">{user ? `${user.id}:${String(user.remember)}` : "sin sesión"}</span>;
}

describe("UserContext · Recordarme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("al volver a abrir, sincronizar el perfil no borra la sesión recordada", async () => {
    window.localStorage.setItem(KEY, JSON.stringify(recordada));
    // El perfil del servidor trae a la persona, no la marca de «Recordarme» ni la caducidad.
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ id: 7, nombre: "Luis Joel", email: "luis@nexara.com.mx", role: "Encargado", permissions: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getByTestId } = render(
      <UserProvider>
        <Mira />
      </UserProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Ya se aplicó el perfil (nombre nuevo) y se volvió a guardar la sesión.
    await waitFor(() => expect(JSON.parse(window.sessionStorage.getItem(KEY) ?? "{}").nombre).toBe("Luis Joel"));

    expect(getByTestId("u").textContent).toBe("7:true");
    const copia = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    expect(copia?.remember).toBe(true);
    expect(copia?.expiresAt).toBe(futuro);
    expect(copia?.nombre).toBe("Luis Joel");
  });
});
