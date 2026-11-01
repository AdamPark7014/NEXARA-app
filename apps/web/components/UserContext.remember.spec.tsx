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

/** API falsa: `session/extend` responde `extendida`; `auth/profile`, a Luis. */
function apiConSesion(extendida: Record<string, unknown> | null) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const ruta = String(url);
    if (ruta.includes("session/extend")) {
      return extendida
        ? new Response(JSON.stringify(extendida), { status: 200, headers: { "Content-Type": "application/json" } })
        : new Response("{}", { status: 401 });
    }
    return new Response(
      JSON.stringify({ id: 7, nombre: "Luis", email: "luis@nexara.com.mx", role: "Encargado", permissions: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
}

describe("UserContext · Recordarme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie = "nx_session=; Path=/; Max-Age=0";
  });

  it("en otro subdominio, sin copia guardada, recupera la sesión recordada de la cookie", async () => {
    document.cookie = "nx_session=1; Path=/";
    const fetchMock = apiConSesion({ access_token: "nuevo.jwt.firma", expiresAt: futuro, rememberMe: true });
    vi.stubGlobal("fetch", fetchMock);

    const { getByTestId } = render(
      <UserProvider>
        <Mira />
      </UserProvider>,
    );

    await waitFor(() => expect(getByTestId("u").textContent).toBe("7:true"));
    const extend = fetchMock.mock.calls.find(([u]) => String(u).includes("session/extend"));
    // Sin cabecera Authorization: la API usa la cookie HttpOnly de 30 días.
    expect((extend?.[1] as RequestInit | undefined)?.credentials).toBe("include");
    expect(new Headers((extend?.[1] as RequestInit | undefined)?.headers).has("Authorization")).toBe(false);
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(KEY) ?? "null")?.token).toBe("nuevo.jwt.firma"));
  });

  it("una sesión sin «Recordarme» no se toma en otra pestaña", async () => {
    document.cookie = "nx_session=1; Path=/";
    vi.stubGlobal("fetch", apiConSesion({ access_token: "otro.jwt.firma", expiresAt: futuro, rememberMe: false }));

    const { getByTestId } = render(
      <UserProvider>
        <Mira />
      </UserProvider>,
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(getByTestId("u").textContent).toBe("sin sesión");
  });

  it("sin aviso de sesión en el navegador no llama a la API", async () => {
    const fetchMock = apiConSesion(null);
    vi.stubGlobal("fetch", fetchMock);

    const { getByTestId } = render(
      <UserProvider>
        <Mira />
      </UserProvider>,
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getByTestId("u").textContent).toBe("sin sesión");
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
