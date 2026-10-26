"use client";

import dynamic from "next/dynamic";

/* Lo que el sitio público hereda del layout anterior: medición de visitas (con consentimiento) y el aviso de cookies. */
const PublicTrafficTracker = dynamic(() => import("@/components/PublicTrafficTracker"), { ssr: false });
const CookieConsentBanner = dynamic(() => import("@/components/CookieConsentBanner"), { ssr: false });

export default function ExtrasSitio() {
  return (
    <>
      <PublicTrafficTracker />
      <CookieConsentBanner />
    </>
  );
}
