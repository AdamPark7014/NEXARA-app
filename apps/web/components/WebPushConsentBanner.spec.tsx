import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebPushConsentBanner from "./WebPushConsentBanner";

const useUser = vi.hoisted(() => vi.fn());
vi.mock("./UserContext", () => ({ useUser }));

/** Las dos frases de main (`8752494e`), citadas para que no vuelvan. */
const TEXTO_VIEJO =
  "Recibe avisos de operación aunque no tengas la pestaña abierta (como Gmail o Slack en el navegador). El siguiente paso es el permiso oficial de tu navegador: solo se pide una vez.";

const TEXTO =
  "Recibe avisos de operación aunque no tengas la pestaña abierta (como Gmail o Slack en el navegador): el siguiente paso es el permiso oficial de tu navegador, que solo se pide una vez.";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("WebPushConsentBanner", () => {
  it("el aviso cabe en una frase y deja atrás el texto viejo", async () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_PUSH_CONSENT_MODE", "banner");
    vi.stubEnv("NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY", "clave-publica-de-prueba");
    useUser.mockReturnValue({ user: { token: "sesion-de-prueba" } });

    const requestPermission = vi.fn(async () => "granted" as NotificationPermission);
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission,
    });

    const user = userEvent.setup();
    render(<WebPushConsentBanner />);

    const aviso = await screen.findByText(TEXTO);
    expect(aviso).toHaveAttribute("id", "nexara-web-push-banner-desc");
    expect(aviso.textContent).toBe(TEXTO);
    expect(TEXTO.split(".").filter((parte) => parte.trim()).length).toBe(1);
    expect(screen.queryByText(TEXTO_VIEJO)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(TEXTO_VIEJO);
    expect(screen.getByRole("button", { name: "Permitir notificaciones" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ahora no" })).toBeEnabled();
    expect(requestPermission).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Permitir notificaciones" }));
    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalledTimes(1);
    });
  });
});
