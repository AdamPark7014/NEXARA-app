import { Capacitor } from "@capacitor/core";

export type HapticIntent = "light" | "medium" | "heavy" | "selection";

const HAPTICS_DISABLED_KEYS = [
  "nexara:a11y:disableHaptics",
  "nexara:disable-haptics",
];

const prefersReducedMotion = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

const hasInternalHapticsDisabledPreference = () => {
  if (typeof window === "undefined") return false;

  return HAPTICS_DISABLED_KEYS.some((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    const normalized = raw.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  });
};

export const isHapticsEnabled = () => !prefersReducedMotion() && !hasInternalHapticsDisabledPreference();

export const setHapticsEnabled = (enabled: boolean) => {
  if (typeof window === "undefined") return;
  const value = enabled ? "false" : "true";
  window.localStorage.setItem(HAPTICS_DISABLED_KEYS[0], value);
};

const triggerWebFallback = (intent: HapticIntent) => {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;

  if (intent === "heavy") {
    navigator.vibrate(22);
    return;
  }

  if (intent === "medium") {
    navigator.vibrate(14);
    return;
  }

  navigator.vibrate(10);
};

export const hapticTap = async (intent: HapticIntent = "light") => {
  if (!isHapticsEnabled()) return;

  try {
    if (!Capacitor.isNativePlatform()) {
      triggerWebFallback(intent);
      return;
    }

    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");

    if (intent === "selection") {
      await Haptics.selectionStart();
      await Haptics.selectionChanged();
      await Haptics.selectionEnd();
      return;
    }

    const style =
      intent === "heavy"
        ? ImpactStyle.Heavy
        : intent === "medium"
          ? ImpactStyle.Medium
          : ImpactStyle.Light;

    await Haptics.impact({ style });
  } catch {
    triggerWebFallback(intent);
  }
};
