export type SeoOpenGraphImage = {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
};

export type SeoData = {
  title: string;
  description: string;
  canonicalUrl: string;
  robots: string;
  keywords: string[];
  openGraph: {
    title: string;
    description: string;
    url: string;
    type: 'website' | 'article' | 'product';
    siteName: string;
    locale: string;
    images: SeoOpenGraphImage[];
  };
  twitter: {
    card: 'summary' | 'summary_large_image';
    title: string;
    description: string;
    images: string[];
  };
};

export type SeoInput = {
  title?: string;
  description?: string;
  baseUrl?: string;
  path?: string;
  keywords?: string[];
  imageUrl?: string;
  imageAlt?: string;
  type?: SeoData['openGraph']['type'];
  locale?: string;
  siteName?: string;
  noIndex?: boolean;
  noFollow?: boolean;
};

const DEFAULT_SITE_NAME = 'Nexara';
const DEFAULT_LOCALE = 'es_MX';
const DEFAULT_TITLE = 'Nexara';
const DEFAULT_DESCRIPTION = 'Soluciones tecnológicas integrales para operación, servicio y crecimiento.';
const DEFAULT_IMAGE = '/logo-nexara-lockup.png';
const MAX_SLUG_LENGTH = 120;

function normalizeText(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function toAsciiSlugSegment(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function clampSlug(slug: string, maxLength: number): string {
  if (slug.length <= maxLength) return slug;
  return slug.slice(0, maxLength).replace(/-+$/g, '');
}

function safeUrl(baseUrl: string | undefined, path: string | undefined): string {
  const safeBase = normalizeText(baseUrl).replace(/\/+$/g, '');
  const safePath = normalizeText(path);
  if (!safeBase && !safePath) return '';
  if (!safeBase) return safePath.startsWith('/') ? safePath : `/${safePath}`;
  if (!safePath) return safeBase;
  return `${safeBase}/${safePath.replace(/^\/+/, '')}`;
}

function dedupeKeywords(keywords: string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const keyword of keywords ?? []) {
    const normalized = normalizeText(keyword).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function buildRobots(noIndex?: boolean, noFollow?: boolean): string {
  const index = noIndex ? 'noindex' : 'index';
  const follow = noFollow ? 'nofollow' : 'follow';
  return `${index}, ${follow}, max-image-preview:large, max-snippet:-1`;
}

export function getSeoData(input: SeoInput = {}): SeoData {
  const siteName = normalizeText(input.siteName) || DEFAULT_SITE_NAME;
  const title = normalizeText(input.title) || DEFAULT_TITLE;
  const description = normalizeText(input.description) || DEFAULT_DESCRIPTION;
  const canonicalUrl = safeUrl(input.baseUrl, input.path);
  const imageUrl = normalizeText(input.imageUrl) || DEFAULT_IMAGE;
  const imageAlt = normalizeText(input.imageAlt) || `${title} - ${siteName}`;
  const type = input.type ?? 'website';
  const locale = normalizeText(input.locale) || DEFAULT_LOCALE;
  const keywords = dedupeKeywords(input.keywords);
  const robots = buildRobots(input.noIndex, input.noFollow);

  return {
    title,
    description,
    canonicalUrl,
    robots,
    keywords,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type,
      siteName,
      locale,
      images: [
        {
          url: imageUrl,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export function generateProductSlug(name: string | undefined, brand: string | undefined, sku: string | undefined): string {
  const safeName = normalizeText(name);
  const safeBrand = normalizeText(brand);
  const safeSku = normalizeText(sku);

  const segments = [safeName, safeBrand, safeSku]
    .map(toAsciiSlugSegment)
    .filter(Boolean);

  const merged = segments.join('-');
  const slug = clampSlug(merged || 'producto', MAX_SLUG_LENGTH);
  return slug || 'producto';
}

export function extractSkuFromSlug(slug: string): string {
  const safeSlug = normalizeText(slug);
  if (!safeSlug) return '';

  let decoded = safeSlug;
  try {
    decoded = decodeURIComponent(safeSlug);
  } catch {
    decoded = safeSlug;
  }

  const tokens = decoded.split('-').map((token) => token.trim()).filter(Boolean);

  // Busca desde el final un token alfanumérico que contenga al menos un dígito.
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
    if (/^(?=.*\d)[a-z0-9][a-z0-9._]{1,31}$/i.test(token)) {
      return token.toUpperCase();
    }
  }

  const numericTail = decoded.match(/(\d{3,})$/);
  return numericTail ? numericTail[1] : '';
}
