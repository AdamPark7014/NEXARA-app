/**
 * Helpers públicos del blog / noticias (listado + detalle SEO).
 */

import { buildApiUrl, getApiAssetOrigin } from "@/lib/api-base";

export type PublicNewsPost = {
  id: number;
  slug: string;
  title: string;
  summary?: string | null;
  content: string;
  coverImageUrl?: string | null;
  galleryUrls?: string[];
  tags: string[];
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | string;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export function normalizeNewsImageUrl(imageUrl?: string | null): string {
  if (!imageUrl) return "/images/hero/hero-06.png";
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
  const origin = getApiAssetOrigin();
  if (imageUrl.startsWith("/")) {
    if (imageUrl.startsWith("/news/image/")) return `${origin}${imageUrl}`;
    return imageUrl;
  }
  return `${origin}/news/image/${imageUrl}`;
}

export function toPlainExcerpt(text?: string | null, fallback = "", max = 180): string {
  const raw = (text || fallback).replace(/\s+/g, " ").trim();
  if (!raw) return "Contenido disponible pronto.";
  if (raw.length <= max) return raw;
  return `${raw.slice(0, Math.max(0, max - 3))}…`;
}

export async function fetchPublishedNews(limit = 50): Promise<PublicNewsPost[]> {
  try {
    const res = await fetch(buildApiUrl(`news?limit=${limit}`), {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];

    const payload = (await res.json()) as
      | PublicNewsPost[]
      | { data?: PublicNewsPost[] }
      | { items?: PublicNewsPost[] };

    const rows = Array.isArray(payload)
      ? payload
      : "data" in payload && Array.isArray(payload.data)
        ? payload.data
        : "items" in payload && Array.isArray(payload.items)
          ? payload.items
          : [];

    return rows.filter((post) => post.status === "PUBLISHED");
  } catch {
    return [];
  }
}

export async function fetchNewsBySlug(slug: string): Promise<PublicNewsPost | null> {
  try {
    const res = await fetch(buildApiUrl(`news/by-slug/${encodeURIComponent(slug)}`), {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicNewsPost;
  } catch {
    return null;
  }
}
