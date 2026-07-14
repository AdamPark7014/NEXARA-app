/**
 * NEXARA · Hero Slides API (frontend client)
 * ------------------------------------------
 * `imageUrl` = desktop (obligatorio).
 * `imageUrlMobile` = móvil opcional; si falta, el sitio usa desktop.
 */
import { buildApiUrl } from "@/lib/api-base";

export type HeroSlide = {
  id: number;
  imageUrl: string;
  imageUrlMobile: string | null;
  altText: string | null;
  caption: string | null;
  href: string | null;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const apiFetch = async (path: string, token: string, init: RequestInit = {}) => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((init.headers as Record<string, string>) || {}),
  };
  if (init.body && !(init.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(buildApiUrl(path), { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `HTTP ${res.status}`;
    if (text) {
      try {
        const json = JSON.parse(text);
        message = Array.isArray(json?.message) ? json.message.join(", ") : (json?.message || text);
      } catch {
        message = text;
      }
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

/** Resuelve la URL final de la imagen — soporta rutas API, estáticas y absolutas. */
export function resolveHeroImageUrl(imageUrl: string): string {
  if (!imageUrl) return "";
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (imageUrl.startsWith("/images/")) return imageUrl;
  return buildApiUrl(imageUrl.replace(/^\//, ""));
}

// ── Público (sin auth) ───────────────────────────────────────────────

export async function fetchPublicHeroSlides(): Promise<HeroSlide[]> {
  const res = await fetch(buildApiUrl("hero-slides/public"), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Admin (Studio) ───────────────────────────────────────────────────

export const listHeroSlides = (token: string): Promise<HeroSlide[]> =>
  apiFetch("hero-slides", token);

export const createHeroSlide = (
  token: string,
  payload: {
    altText?: string;
    caption?: string;
    href?: string;
    isActive?: boolean;
    /** Imagen desktop (obligatoria). */
    file: File;
    /** Imagen móvil opcional. */
    fileMobile?: File;
  },
): Promise<HeroSlide> => {
  const form = new FormData();
  form.append("image", payload.file);
  if (payload.fileMobile) form.append("imageMobile", payload.fileMobile);
  if (payload.altText) form.append("altText", payload.altText);
  if (payload.caption) form.append("caption", payload.caption);
  if (payload.href) form.append("href", payload.href);
  if (payload.isActive !== undefined) form.append("isActive", String(payload.isActive));
  return apiFetch("hero-slides", token, { method: "POST", body: form });
};

export const updateHeroSlide = (
  token: string,
  id: number,
  payload: {
    altText?: string;
    caption?: string;
    href?: string;
    isActive?: boolean;
    file?: File;
    fileMobile?: File;
    clearMobile?: boolean;
  },
): Promise<HeroSlide> => {
  const form = new FormData();
  if (payload.file) form.append("image", payload.file);
  if (payload.fileMobile) form.append("imageMobile", payload.fileMobile);
  if (payload.altText !== undefined) form.append("altText", payload.altText);
  if (payload.caption !== undefined) form.append("caption", payload.caption);
  if (payload.href !== undefined) form.append("href", payload.href);
  if (payload.isActive !== undefined) form.append("isActive", String(payload.isActive));
  if (payload.clearMobile) form.append("clearMobile", "true");
  return apiFetch(`hero-slides/${id}`, token, { method: "PUT", body: form });
};

export const reorderHeroSlides = (token: string, ids: number[]): Promise<HeroSlide[]> =>
  apiFetch("hero-slides/reorder", token, {
    method: "PATCH",
    body: JSON.stringify({ ids }),
  });

export const deleteHeroSlide = (token: string, id: number): Promise<void> =>
  apiFetch(`hero-slides/${id}`, token, { method: "DELETE" });
