/**
 * Industry hubs = páginas `/soluciones/[industry]` que existen en
 * `app/(public)/soluciones/[industry]/page.tsx` (INDUSTRY_HUBS).
 *
 * Money landings (`INDUSTRY_LANDINGS` en programmatic-landings) pueden
 * incluir verticales sin hub propio (p.ej. seguridad-electronica).
 * Nunca enlazar esos slugs como hub: usar `isIndustryHubSlug` o caer a
 * `/servicios` / primera money page.
 *
 * Hubs sin money pages aún: hospitalidad, educacion — CTA a /servicios.
 */
export const INDUSTRY_HUB_SLUGS = [
  "retail",
  "manufactura",
  "hospitalidad",
  "salud",
  "educacion",
  "gobierno",
] as const;

export type IndustryHubSlug = (typeof INDUSTRY_HUB_SLUGS)[number];

export function isIndustryHubSlug(slug: string): slug is IndustryHubSlug {
  return (INDUSTRY_HUB_SLUGS as readonly string[]).includes(slug);
}

/** Hubs que aún no tienen landings money en INDUSTRY_LANDINGS. */
export const INDUSTRY_HUBS_WITHOUT_LANDINGS: readonly IndustryHubSlug[] = [
  "hospitalidad",
  "educacion",
];
