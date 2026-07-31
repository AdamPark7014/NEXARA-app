"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import {
  COOKIE_CONSENT_EVENT,
  getCookieConsent,
  hasAnalyticsConsent,
  type CookieConsentState,
} from "@/lib/cookie-consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Carga GA4 solo tras consentimiento de analítica.
 */
export default function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const [enabled, setEnabled] = useState(false);
  const gaId = measurementId.trim();

  useEffect(() => {
    if (!gaId) return;
    const sync = (state?: CookieConsentState | null) => {
      setEnabled(hasAnalyticsConsent(state === undefined ? getCookieConsent() : state));
    };
    sync();
    const onConsent = (event: Event) => {
      const detail = (event as CustomEvent<CookieConsentState>).detail;
      sync(detail ?? getCookieConsent());
    };
    window.addEventListener(COOKIE_CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onConsent);
  }, [gaId]);

  if (!gaId || !enabled) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaId}', { page_path: window.location.pathname, anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
