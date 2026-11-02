/**
 * El nombre de un fabricante sin su razón social: «Dahua Technology» y «Dahua» son la misma marca, en el
 * filtro del catálogo y en la serigrafía del modelo, donde un nombre largo no cabe.
 */
const SOBRA = /[\s,]+(network\s+)?(technolog(y|ies)|tech|corporation|corp\.?|company|co\.?|ltd\.?|limited|inc\.?|llc|s\.?a\.?(\s+de\s+c\.?v\.?)?|gmbh)\b\.?/gi;

export function marcaCorta(marca: string | null | undefined): string {
  const limpia = String(marca ?? "").replace(/\s+/g, " ").trim();
  if (!limpia) return "";
  return limpia.replace(SOBRA, "").replace(/[\s,.]+$/, "").trim() || limpia;
}

export const claveMarca = (marca: string | null | undefined) => marcaCorta(marca).toLowerCase();
