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

/** Abre URL en nueva pestaña (misma API que en mobile; aquí siempre es navegador). */
export async function openExternalUrl(href: string): Promise<void> {
  if (!href || typeof window === "undefined") return;
  const url = toAbsoluteUrl(href);
  window.open(url, "_blank", "noopener,noreferrer");
}
