/**
 * Consentimiento de cookies del sitio público (LFPDPPP / buenas prácticas).
 * Necesarias siempre activas; analítica y preferencias requieren opt-in.
 */

export const COOKIE_CONSENT_STORAGE_KEY = "nexara_cookie_consent_v1";
export const COOKIE_CONSENT_EVENT = "nexara-cookie-consent";
export const COOKIE_CONSENT_OPEN_EVENT = "nexara-cookie-consent-open";

export type CookieConsentCategories = {
  necessary: true;
  analytics: boolean;
  preferences: boolean;
};

export type CookieConsentState = {
  version: 1;
  updatedAt: string;
  categories: CookieConsentCategories;
};

export const DEFAULT_CONSENT_CATEGORIES: CookieConsentCategories = {
  necessary: true,
  analytics: false,
  preferences: false,
};

export function createConsentState(
  categories: Pick<CookieConsentCategories, "analytics" | "preferences">,
): CookieConsentState {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    categories: {
      necessary: true,
      analytics: Boolean(categories.analytics),
      preferences: Boolean(categories.preferences),
    },
  };
}

export function acceptAllConsent(): CookieConsentState {
  return createConsentState({ analytics: true, preferences: true });
}

export function necessaryOnlyConsent(): CookieConsentState {
  return createConsentState({ analytics: false, preferences: false });
}

export function getCookieConsent(): CookieConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsentState;
    if (!parsed || parsed.version !== 1 || !parsed.categories) return null;
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      categories: {
        necessary: true,
        analytics: Boolean(parsed.categories.analytics),
        preferences: Boolean(parsed.categories.preferences),
      },
    };
  } catch {
    return null;
  }
}

export function setCookieConsent(state: CookieConsentState): void {
  if (typeof window === "undefined") return;
  const normalized = createConsentState({
    analytics: state.categories.analytics,
    preferences: state.categories.preferences,
  });
  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(
    new CustomEvent(COOKIE_CONSENT_EVENT, { detail: normalized }),
  );
}

export function hasAnalyticsConsent(state?: CookieConsentState | null): boolean {
  const current = state === undefined ? getCookieConsent() : state;
  return Boolean(current?.categories.analytics);
}

export function openCookiePreferences(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COOKIE_CONSENT_OPEN_EVENT));
}
