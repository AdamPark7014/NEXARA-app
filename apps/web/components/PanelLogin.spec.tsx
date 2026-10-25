import { render, screen } from "@testing-library/react";
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
});
