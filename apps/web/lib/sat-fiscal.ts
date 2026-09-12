/** Catálogo c_RegimenFiscal (mirror del API) para UI offline. */
export const SAT_FISCAL_REGIMES_CLIENT = [
  { code: "601", name: "General de Ley Personas Morales", moral: true, fisica: false },
  { code: "603", name: "Personas Morales con Fines no Lucrativos", moral: true, fisica: false },
  { code: "605", name: "Sueldos y Salarios e Ingresos Asimilados a Salarios", moral: false, fisica: true },
  { code: "606", name: "Arrendamiento", moral: false, fisica: true },
  { code: "607", name: "Régimen de Enajenación o Adquisición de Bienes", moral: false, fisica: true },
  { code: "608", name: "Demás ingresos", moral: false, fisica: true },
  { code: "610", name: "Residentes en el Extranjero sin Establecimiento Permanente", moral: true, fisica: true },
  { code: "611", name: "Ingresos por Dividendos (socios y accionistas)", moral: false, fisica: true },
  { code: "612", name: "Personas Físicas con Actividades Empresariales y Profesionales", moral: false, fisica: true },
  { code: "614", name: "Ingresos por intereses", moral: false, fisica: true },
  { code: "615", name: "Régimen de los ingresos por obtención de premios", moral: false, fisica: true },
  { code: "616", name: "Sin obligaciones fiscales", moral: false, fisica: true },
  { code: "620", name: "Sociedades Cooperativas de Producción", moral: true, fisica: false },
  { code: "621", name: "Incorporación Fiscal", moral: false, fisica: true },
  { code: "622", name: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras", moral: true, fisica: false },
  { code: "623", name: "Opcional para Grupos de Sociedades", moral: true, fisica: false },
  { code: "624", name: "Coordinados", moral: true, fisica: false },
  { code: "625", name: "Actividades Empresariales con ingresos vía Plataformas Tecnológicas", moral: false, fisica: true },
  { code: "626", name: "Régimen Simplificado de Confianza", moral: true, fisica: true },
] as const;

export type SatPersonType = "MORAL" | "FISICA" | "OTHER";

export function personTypeFromRfc(rfc: string): SatPersonType {
  const n = (rfc || "").trim().toUpperCase();
  if (/^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/.test(n)) return "MORAL";
  if (/^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/.test(n)) return "FISICA";
  return "OTHER";
}

export function regimesForRfc(rfc: string): Array<{ code: string; name: string }> {
  const t = personTypeFromRfc(rfc);
  if (t === "MORAL") return SAT_FISCAL_REGIMES_CLIENT.filter((r) => r.moral).map(({ code, name }) => ({ code, name }));
  if (t === "FISICA") return SAT_FISCAL_REGIMES_CLIENT.filter((r) => r.fisica).map(({ code, name }) => ({ code, name }));
  return SAT_FISCAL_REGIMES_CLIENT.map(({ code, name }) => ({ code, name }));
}
