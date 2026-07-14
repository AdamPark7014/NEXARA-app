/** Medidas recomendadas para imágenes del sitio público (Studio). */

export type StudioImageSpec = {
  id: string;
  label: string;
  width: number;
  height: number;
  ratio: string;
  formats: string;
  maxSizeMb: number;
  /** Dónde se muestra en el sitio */
  usage: string;
  tip?: string;
};

export const STUDIO_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export const STUDIO_IMAGE_SPECS = {
  heroCarousel: {
    id: "hero_carousel",
    label: "Carrusel del inicio · Desktop",
    width: 1920,
    height: 1080,
    ratio: "16:9",
    formats: "JPG, PNG, WEBP o GIF",
    maxSizeMb: 5,
    usage: "Hero del home en pantallas ≥768px",
    tip: "Este es el formato DESKTOP. Sube aparte la variante móvil (vertical) si quieres un encuadre distinto.",
  },
  heroCarouselMobile: {
    id: "hero_carousel_mobile",
    label: "Carrusel del inicio · Móvil",
    width: 1080,
    height: 1920,
    ratio: "9:16",
    formats: "JPG, PNG, WEBP o GIF",
    maxSizeMb: 5,
    usage: "Hero del home en pantallas <768px",
    tip: "Opcional. Si no subes móvil, el sitio usa la imagen desktop.",
  },
  pageHeroDesktop: {
    id: "page_hero_desktop",
    label: "Hero de página · Desktop",
    width: 1920,
    height: 1080,
    ratio: "16:9",
    formats: "JPG, PNG o WEBP",
    maxSizeMb: 5,
    usage: "Hero full-bleed de páginas internas",
  },
  pageHeroMobile: {
    id: "page_hero_mobile",
    label: "Hero de página · Móvil",
    width: 1080,
    height: 1440,
    ratio: "3:4",
    formats: "JPG, PNG o WEBP",
    maxSizeMb: 4,
    usage: "Hero en móvil (<768px)",
    tip: "Opcional. Sin móvil se usa desktop.",
  },
  pageEditorial: {
    id: "page_editorial",
    label: "Imagen editorial de sección",
    width: 1600,
    height: 900,
    ratio: "16:9",
    formats: "JPG, PNG o WEBP",
    maxSizeMb: 4,
    usage: "Bandas / figuras a mitad de página",
  },
  caseCover: {
    id: "case_cover",
    label: "Portada de caso de éxito",
    width: 1440,
    height: 960,
    ratio: "3:2",
    formats: "JPG, PNG o WEBP",
    maxSizeMb: 4,
    usage: "Tarjeta en /proyectos (columna izquierda)",
    tip: "Horizontal, buena luz de sitio; evita texto pequeño en la foto.",
  },
  blogCoverFeatured: {
    id: "blog_cover_featured",
    label: "Portada de artículo (destacado)",
    width: 1600,
    height: 900,
    ratio: "16:9",
    formats: "JPG, PNG o WEBP",
    maxSizeMb: 4,
    usage: "Artículo principal en /noticias",
    tip: "La mitad izquierda de la tarjeta es solo imagen.",
  },
  blogCoverCard: {
    id: "blog_cover_card",
    label: "Portada de artículo (tarjeta)",
    width: 1200,
    height: 675,
    ratio: "16:9",
    formats: "JPG, PNG o WEBP",
    maxSizeMb: 3,
    usage: "Grid de entradas en /noticias",
    tip: "Misma proporción que el destacado; se recorta con object-fit: cover.",
  },
  socialInstagramFeed: {
    id: "social_ig_feed",
    label: "Instagram · publicación",
    width: 1080,
    height: 1080,
    ratio: "1:1",
    formats: "JPG o PNG",
    maxSizeMb: 5,
    usage: "Feed cuadrado de Instagram",
  },
  socialInstagramStory: {
    id: "social_ig_story",
    label: "Instagram · historia / reel",
    width: 1080,
    height: 1920,
    ratio: "9:16",
    formats: "JPG o PNG",
    maxSizeMb: 5,
    usage: "Historias y Reels verticales",
    tip: "Deja margen superior e inferior (zona de UI de la app).",
  },
  socialLinkedIn: {
    id: "social_linkedin",
    label: "LinkedIn",
    width: 1200,
    height: 627,
    ratio: "1.91:1",
    formats: "JPG o PNG",
    maxSizeMb: 5,
    usage: "Publicación en feed de LinkedIn",
  },
  socialFacebook: {
    id: "social_facebook",
    label: "Facebook",
    width: 1200,
    height: 630,
    ratio: "1.91:1",
    formats: "JPG o PNG",
    maxSizeMb: 5,
    usage: "Publicación en feed de Facebook",
  },
  socialTwitter: {
    id: "social_twitter",
    label: "X (Twitter)",
    width: 1600,
    height: 900,
    ratio: "16:9",
    formats: "JPG o PNG",
    maxSizeMb: 5,
    usage: "Imagen en publicación de X",
  },
  socialTikTok: {
    id: "social_tiktok",
    label: "TikTok",
    width: 1080,
    height: 1920,
    ratio: "9:16",
    formats: "JPG o PNG",
    maxSizeMb: 5,
    usage: "Miniatura o frame vertical",
    tip: "Formato vertical pantalla completa.",
  },
} as const satisfies Record<string, StudioImageSpec>;

export type StudioImageSpecKey = keyof typeof STUDIO_IMAGE_SPECS;

export function formatStudioImageSize(spec: StudioImageSpec): string {
  return `${spec.width}×${spec.height} px`;
}

export function studioImageHintLine(spec: StudioImageSpec): string {
  return `Recomendado: ${formatStudioImageSize(spec)} (${spec.ratio}) · ${spec.formats} · máx. ${spec.maxSizeMb} MB`;
}

export function studioImageHintDetail(spec: StudioImageSpec): string {
  const parts = [
    studioImageHintLine(spec),
    spec.usage,
    spec.tip,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function getSocialImageSpec(network: string): StudioImageSpec {
  switch (network) {
    case "Instagram":
      return STUDIO_IMAGE_SPECS.socialInstagramFeed;
    case "LinkedIn":
      return STUDIO_IMAGE_SPECS.socialLinkedIn;
    case "Facebook":
      return STUDIO_IMAGE_SPECS.socialFacebook;
    case "Twitter":
      return STUDIO_IMAGE_SPECS.socialTwitter;
    case "TikTok":
      return STUDIO_IMAGE_SPECS.socialTikTok;
    default:
      return STUDIO_IMAGE_SPECS.socialInstagramFeed;
  }
}

export function validateStudioImageFile(
  file: File,
  spec: StudioImageSpec,
): string | null {
  const allowed = STUDIO_IMAGE_ACCEPT.split(",");
  if (!allowed.includes(file.type)) {
    return `Formato no permitido. Usa ${spec.formats}.`;
  }
  if (file.size > spec.maxSizeMb * 1024 * 1024) {
    return `El archivo supera ${spec.maxSizeMb} MB.`;
  }
  return null;
}
