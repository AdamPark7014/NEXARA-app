"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { COOKIE_CONSENT_OPEN_EVENT } from "@/lib/cookie-consent";

/* Lo que el sitio público hereda del layout anterior: medición de visitas (con consentimiento) y el aviso de cookies. */
const PublicTrafficTracker = dynamic(() => import("@/components/PublicTrafficTracker"), { ssr: false });
const CookieConsentBanner = dynamic(() => import("@/components/CookieConsentBanner"), { ssr: false });

/** Lo que tarda la entrada de la portada en quedar armada, con un respiro (ensamble.module.css). */
const ESPERA_ENTRADA = 3000;

export default function ExtrasSitio() {
  // En la primera visita a la portada, el aviso de cookies espera a que termine la entrada para no taparla. Nada se
  // mide antes del consentimiento, así que esperar no cambia lo que se guarda.
  const [aviso, setAviso] = useState(false);

  useEffect(() => {
    const entrando =
      document.querySelector("[data-nx-escenario]") !== null &&
      document.documentElement.getAttribute("data-intro") !== "visto" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!entrando) {
      setAviso(true);
      return;
    }
    const mostrar = () => setAviso(true);
    const espera = window.setTimeout(mostrar, ESPERA_ENTRADA);
    // «Configurar cookies» en el pie: si alguien lo toca antes, el aviso sale de una vez.
    window.addEventListener(COOKIE_CONSENT_OPEN_EVENT, mostrar);
    return () => {
      window.clearTimeout(espera);
      window.removeEventListener(COOKIE_CONSENT_OPEN_EVENT, mostrar);
    };
  }, []);

  return (
    <>
      <PublicTrafficTracker />
      {aviso ? <CookieConsentBanner /> : null}
    </>
  );
}
