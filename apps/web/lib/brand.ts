/**
 * Marca NEXARA — assets por superficie.
 *
 * - Lockup (`logo-nexara-lockup.png`): solo sitio público (nexara.com.mx).
 * - Mark (`logo-nexara-platform.png`): login + paneles (CRM / ERP / OPS / …).
 */

/** Lockup horizontal — marketing / sitio principal. */
export const NEXARA_LOGO_LOCKUP = "/logo-nexara-lockup.png";

/** Isotipo cuadrado — login y shell de paneles. */
export const NEXARA_LOGO_MARK = "/logo-nexara-platform.png";

/**
 * Favicon / iconos de pestaña — mismo isotipo que el login
 * (`logo-nexara-platform.png`), sin fondo negro; v4 = cache-bust.
 */
export const NEXARA_FAVICON_ICO = "/brand/nexara-mark-v4.ico";
export const NEXARA_FAVICON_48 = "/brand/nexara-mark-v4-48.png";
export const NEXARA_FAVICON_192 = "/brand/nexara-mark-v4-192.png";
export const NEXARA_FAVICON_512 = "/brand/nexara-mark-v4-512.png";
export const NEXARA_APPLE_TOUCH = "/brand/nexara-mark-v4-180.png";

/**
 * Domicilio fiscal tal cual la constancia del SAT (nombre comercial NEXARA).
 * El Perfil de Negocio de Google lleva estos mismos datos: si cambian aquí, cambian allá.
 */
export const NEXARA_DOMICILIO = {
  calle: "Calle Ignacio Allende 512, Local 2",
  colonia: "Santiago Momoxpan",
  codigoPostal: "72775",
  municipio: "San Pedro Cholula",
  estado: "Puebla",
} as const;

/** Una línea, para mostrar en el sitio. */
export const NEXARA_DOMICILIO_TEXTO = `${NEXARA_DOMICILIO.calle}, ${NEXARA_DOMICILIO.colonia}, ${NEXARA_DOMICILIO.codigoPostal} ${NEXARA_DOMICILIO.municipio}, ${NEXARA_DOMICILIO.estado}`;

/** `PostalAddress` de schema.org para los datos estructurados. */
export const NEXARA_DIRECCION_POSTAL = {
  "@type": "PostalAddress",
  streetAddress: `${NEXARA_DOMICILIO.calle}, ${NEXARA_DOMICILIO.colonia}`,
  addressLocality: NEXARA_DOMICILIO.municipio,
  postalCode: NEXARA_DOMICILIO.codigoPostal,
  addressRegion: NEXARA_DOMICILIO.estado,
  addressCountry: "MX",
} as const;

/** Google Maps por dirección: abre aunque el Perfil de Negocio esté en revisión. */
export const NEXARA_MAPS_LINK = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(NEXARA_DOMICILIO_TEXTO)}`;

/**
 * Ficha real de NEXARA en Google Maps (perfil verificado, visto el 09-11-2026). Va en los datos
 * estructurados para que Google ligue el sitio con esa ficha, no solo con una dirección.
 */
export const NEXARA_MAPS_PERFIL = "https://www.google.com/maps?cid=18142932209612815098";

/** Coordenadas del pin de esa ficha. */
export const NEXARA_GEO = { "@type": "GeoCoordinates", latitude: 19.0725922, longitude: -98.2766862 } as const;

/** Páginas oficiales de la marca; las mismas del pie del sitio. */
export const NEXARA_PERFILES_OFICIALES = [
  NEXARA_MAPS_PERFIL,
  "https://www.facebook.com/nexara.mexico/",
  "https://www.instagram.com/nexara_mx/",
] as const;
