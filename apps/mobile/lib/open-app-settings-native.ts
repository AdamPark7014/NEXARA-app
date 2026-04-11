import { isCapacitorNative } from "./capacitor-env";

const ANDROID_PACKAGE = "mx.nexara.mobile";

/**
 * Abre la ficha de la app en Ajustes (Android: detalles de aplicación → Notificaciones).
 * En iOS intenta el esquema `app-settings:` (válido en muchos dispositivos).
 */
export async function openNexaraAppSettings(): Promise<void> {
  if (!isCapacitorNative() || typeof window === "undefined") return;
  try {
    const { Capacitor } = await import("@capacitor/core");
    const platform = Capacitor.getPlatform();
    if (platform === "android") {
      window.location.href = `intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:${ANDROID_PACKAGE};end`;
      return;
    }
    if (platform === "ios") {
      window.location.href = "app-settings:";
    }
  } catch {
    /* noop */
  }
}
