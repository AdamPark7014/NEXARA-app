import { isCapacitorNative } from "./capacitor-env";

/** Convierte href relativo en absoluto (útil en Capacitor / WebView). */
export function toAbsoluteUrl(href: string): string {
  if (!href || typeof window === "undefined") return href;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("blob:") || href.startsWith("data:")) return href;
  try {
    return new URL(href, window.location.origin).href;
  } catch {
    return href;
  }
}

/**
 * Abre URL en el navegador del sistema en app nativa (evita WebView roto con target=_blank).
 * En web usa window.open. No añade JWT: URLs que requieren Bearer deben abrirse en-app (PDFViewer / fetch+blob).
 */
export async function openExternalUrl(href: string): Promise<void> {
  if (!href || typeof window === "undefined") return;
  const url = toAbsoluteUrl(href);
  const isHttp = /^https?:\/\//i.test(url);

  if (isCapacitorNative()) {
    if (isHttp) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "fullscreen" });
      return;
    }

    // mailto:, tel:, sms:, etc. delegate to OS handlers.
    // In Capacitor, assigning location is the most reliable lightweight option
    // without adding extra native plugins.
    window.location.href = url;
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
