/** Single source of truth: industry hub slugs that exist as `/soluciones/[industry]` pages. */
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
