import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PanelLogin from "./PanelLogin";

vi.mock("next/image", () => ({
  default: (props: { alt?: string }) => <img alt={props.alt ?? ""} />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("./UserContext", () => ({
  useUser: () => ({ setUser: vi.fn() }),
}));

vi.mock("@/lib/realtime-socket", () => ({
  createRealtimeSocket: () => ({
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

/** Las dos frases que el aviso de `sso=error` ya no debe decir. */
const TEXTO_VIEJO = "SSO falló. Revisa OIDC o que el usuario exista en NEXARA.";
const TEXTO_NUEVO = "SSO falló: revisa OIDC o que el usuario exista en NEXARA.";

describe("PanelLogin · sso=error", () => {
  it("junta el fallo en una frase y deja atrás el texto viejo", async () => {
    window.history.pushState({}, "", "/login?sso=error");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ enabled: false }), { status: 200 })),
    );

    render(<PanelLogin redirectTo="/dashboard" />);

    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toContain(TEXTO_NUEVO);
    expect(aviso.textContent).not.toContain(TEXTO_VIEJO);
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.queryByText("No se pudo completar el SSO")).not.toBeInTheDocument();
  });

  it("explica en una frase por qué no entró con Microsoft o Google", async () => {
    window.history.pushState({}, "", "/login?sso=error&motivo=no_provisionado");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ enabled: false }), { status: 200 })),
    );

    render(<PanelLogin redirectTo="/dashboard" />);

    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toContain("Ese correo no tiene cuenta en NEXARA");
  });
});

describe("PanelLogin · verificación en dos pasos", () => {
  it("con la contraseña correcta pide el código en su propio paso, sin aviso de error", async () => {
    window.history.pushState({}, "", "/login");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) =>
        String(url).includes("auth/login")
          ? new Response(JSON.stringify({ statusCode: 401, message: "MFA_REQUIRED" }), { status: 401 })
          : new Response(JSON.stringify({ enabled: false }), { status: 200 }),
      ),
    );

    render(<PanelLogin redirectTo="/dashboard" />);
    fireEvent.change(screen.getByLabelText("Correo de empresa"), { target: { value: "ana@nexara.com.mx" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "secreta123" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("heading", { name: "Verificación en dos pasos" })).toBeInTheDocument();
    expect(screen.getByLabelText("Código de verificación")).toBeInTheDocument();
    expect(screen.queryByLabelText("Contraseña")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verificar" })).toBeInTheDocument();
  });
});

describe("PanelLogin · botones de Google y Microsoft", () => {
  it("solo aparecen los proveedores configurados en la API", async () => {
    window.history.pushState({}, "", "/login");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ enabled: true, proveedores: { google: false, microsoft: true, oidc: false } }),
            { status: 200 },
          ),
      ),
    );

    render(<PanelLogin redirectTo="/dashboard" />);

    expect(await screen.findByRole("button", { name: "Continuar con Microsoft" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar con Google" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar con SSO / OIDC" })).not.toBeInTheDocument();
  });
});
