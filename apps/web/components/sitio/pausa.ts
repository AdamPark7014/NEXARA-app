/** Pausa de todo lo que se mueve solo en el sitio público: `<html data-pausa>` (dura la sesión). */
export const PAUSA = "nx:pausa";
export const PAUSA_EVENTO = "nexara:pausa";

export function leerPausa(): boolean {
  try {
    return sessionStorage.getItem(PAUSA) === "1";
  } catch {
    return false;
  }
}

export function aplicarPausa(pausa: boolean) {
  // Lo que gira sin fin queda en una sola vuelta (sitio-documento.css) y aquí se da por terminada en el acto.
  const sinFin = pausa
    ? (document.getAnimations?.() ?? []).filter((a) => a.effect?.getComputedTiming().iterations === Infinity)
    : [];
  document.documentElement.toggleAttribute("data-pausa", pausa);
  if (sinFin.length) void document.documentElement.offsetWidth;
  for (const a of sinFin) {
    if (a.effect?.getComputedTiming().iterations !== Infinity) a.finish();
  }
  try {
    sessionStorage.setItem(PAUSA, pausa ? "1" : "0");
  } catch {
    /* almacenamiento bloqueado: dura lo que la página */
  }
  window.dispatchEvent(new CustomEvent(PAUSA_EVENTO, { detail: pausa }));
}

/** ¿Debe quedarse quieto lo que avanza solo? */
export const enCalma = () =>
  document.documentElement.hasAttribute("data-pausa") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
