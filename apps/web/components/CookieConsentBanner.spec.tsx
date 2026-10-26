import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CookieConsentBanner from "./CookieConsentBanner";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const AVISO =
  "Solo usamos cookies necesarias y, con tu permiso, activamos analítica para mejorar el sitio: consulta el Aviso de Privacidad y la Política de Cookies.";

const NECESARIAS =
  "Autenticación, seguridad y funcionamiento básico, siempre activas.";

function frases(texto: string) {
  return texto.split(".").map((parte) => parte.trim()).filter(Boolean);
}

function categoriasGuardadas() {
  return JSON.parse(localStorage.getItem("nexara_cookie_consent_v1")!).categories;
}

describe("CookieConsentBanner", () => {
  it("el aviso público es una frase y conserva los enlaces", async () => {
    render(<CookieConsentBanner />);
    const aviso = await screen.findByText((_, node) => node?.id === "nexara-cookie-consent-desc");
    expect(aviso).toHaveTextContent(AVISO);
    expect(frases(AVISO)).toEqual([
      "Solo usamos cookies necesarias y, con tu permiso, activamos analítica para mejorar el sitio: consulta el Aviso de Privacidad y la Política de Cookies",
    ]);
    expect(screen.getByRole("link", { name: "Aviso de Privacidad" })).toHaveAttribute(
      "href",
      "/legal/privacidad",
    );
    expect(screen.getByRole("link", { name: "Política de Cookies" })).toHaveAttribute(
      "href",
      "/legal/cookies",
    );
    expect(screen.getByRole("button", { name: "Solo necesarias" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aceptar todas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Configurar" })).toBeInTheDocument();
  });

  it("al configurar, las necesarias son una frase", async () => {
    const user = userEvent.setup();
    render(<CookieConsentBanner />);
    await user.click(await screen.findByRole("button", { name: "Configurar" }));
    expect(screen.getByText(NECESARIAS)).toBeInTheDocument();
    expect(frases(NECESARIAS)).toEqual([
      "Autenticación, seguridad y funcionamiento básico, siempre activas",
    ]);
    expect(screen.getByRole("button", { name: "Guardar preferencias" })).toBeInTheDocument();
  });

  it("solo necesarias sigue guardando sin analítica ni preferencias", async () => {
    const user = userEvent.setup();
    render(<CookieConsentBanner />);
    await user.click(await screen.findByRole("button", { name: "Solo necesarias" }));
    expect(categoriasGuardadas()).toEqual({
      necessary: true,
      analytics: false,
      preferences: false,
    });
  });

  it("aceptar todas sigue guardando analítica y preferencias", async () => {
    const user = userEvent.setup();
    render(<CookieConsentBanner />);
    await user.click(await screen.findByRole("button", { name: "Aceptar todas" }));
    expect(categoriasGuardadas()).toEqual({
      necessary: true,
      analytics: true,
      preferences: true,
    });
  });

  it("guardar preferencias sigue guardando solo lo que se activó", async () => {
    const user = userEvent.setup();
    render(<CookieConsentBanner />);
    await user.click(await screen.findByRole("button", { name: "Configurar" }));
    await user.click(screen.getByRole("button", { name: "Cookies de analítica" }));
    await user.click(screen.getByRole("button", { name: "Guardar preferencias" }));
    expect(categoriasGuardadas()).toEqual({
      necessary: true,
      analytics: true,
      preferences: false,
    });
  });
});
