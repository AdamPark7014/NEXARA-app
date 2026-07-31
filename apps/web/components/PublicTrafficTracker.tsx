"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { buildApiUrl } from "@/lib/api-base";
import {
  COOKIE_CONSENT_EVENT,
  getCookieConsent,
  hasAnalyticsConsent,
  type CookieConsentState,
} from "@/lib/cookie-consent";

const parseLandingKey = (pathname: string) => {
  const clean = pathname.replace(/\/+$/, "");
  const parts = clean.split("/").filter(Boolean);

  if (parts.length >= 3 && parts[0] === "soluciones") {
    return `${parts[1]}/${parts[2]}`;
  }

  if (parts.length === 0) return "home";
  return parts.join("/");
};

const trackEvent = (payload: Record<string, unknown>) => {
  const endpoint = buildApiUrl("public-analytics/events");
  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(endpoint, blob);
    return;
  }

  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
};

export default function PublicTrafficTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);

  const utmSnapshot = useMemo(() => ({
    source: searchParams?.get("utm_source") || null,
    medium: searchParams?.get("utm_medium") || null,
    campaign: searchParams?.get("utm_campaign") || null,
    term: searchParams?.get("utm_term") || null,
    content: searchParams?.get("utm_content") || null,
  }), [searchParams]);

  useEffect(() => {
    const sync = (state?: CookieConsentState | null) => {
      setAnalyticsAllowed(
        hasAnalyticsConsent(state === undefined ? getCookieConsent() : state),
      );
    };
    sync();
    const onConsent = (event: Event) => {
      const detail = (event as CustomEvent<CookieConsentState>).detail;
      sync(detail ?? getCookieConsent());
    };
    window.addEventListener(COOKIE_CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onConsent);
  }, []);

  useEffect(() => {
    if (!analyticsAllowed || !pathname) return;

    const landingKey = parseLandingKey(pathname);
    trackEvent({
      landingKey,
      landingPath: pathname,
      eventType: "view",
      eventName: "page_view",
      referrer: typeof document !== "undefined" ? document.referrer : "",
      metadata: {
        ...utmSnapshot,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      },
    });
  }, [pathname, utmSnapshot, analyticsAllowed]);

  useEffect(() => {
    if (!analyticsAllowed) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const element = target.closest("[data-track-conversion]") as HTMLElement | null;
      if (!element) return;

      const action = element.getAttribute("data-track-conversion") || "cta_click";
      const customPath = element.getAttribute("data-landing-path");
      const resolvedPath = customPath || pathname || "/";
      const landingKey = parseLandingKey(resolvedPath);

      trackEvent({
        landingKey,
        landingPath: resolvedPath,
        eventType: action.includes("primary") || action.includes("submit") ? "conversion" : "click",
        eventName: action,
        referrer: typeof document !== "undefined" ? document.referrer : "",
        metadata: {
          ...utmSnapshot,
          href: element.getAttribute("href") || null,
          text: element.textContent?.trim() || null,
        },
      });
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [pathname, utmSnapshot, analyticsAllowed]);

  return null;
}
