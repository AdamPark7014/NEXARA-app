/**
 * NEXARA · Hero Video API (frontend client)
 * ------------------------------------------
 * Consume `apps/api/src/hero-video/hero-video.controller.ts`.
 *
 * `videoUrl` = desktop (obligatorio / lo que había antes).
 * `videoUrlMobile` = móvil opcional; si falta, el sitio usa desktop.
 */
import { buildApiUrl } from "@/lib/api-base";

export type HeroVideo = {
  id: number;
  videoUrl: string;
  videoUrlMobile: string | null;
  posterUrl: string | null;
  title: string | null;
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

/** Resuelve URL del stream para el <video> — siempre same-origin /api (nunca host Docker). */
export function resolveHeroVideoUrl(videoUrl: string): string {
  if (!videoUrl) return "";
  if (/^https?:\/\//i.test(videoUrl)) {
    try {
      const parsed = new URL(videoUrl);
      const host = parsed.hostname.toLowerCase();
      if (
        host === "nexara-api" ||
        host === "localhost" ||
        host === "127.0.0.1" ||
        host.endsWith(".internal")
      ) {
        const path = parsed.pathname.replace(/^\/api(?=\/)/, "") || "/";
        if (path.startsWith("/uploads/") || path.startsWith("/images/")) return path;
        return `/api${path.startsWith("/") ? path : `/${path}`}`;
      }
    } catch {
      /* keep absolute */
    }
    return videoUrl;
  }
  if (videoUrl.startsWith("/images/") || videoUrl.startsWith("/uploads/")) return videoUrl;
  const path = videoUrl.replace(/^\//, "");
  return `/api/${path}`;
}

// ── Público (sin auth) ───────────────────────────────────────────────

export async function fetchPublicHeroVideo(): Promise<HeroVideo | null> {
  const res = await fetch(buildApiUrl("hero-video/public"), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data ?? null;
}

/** SSR / ISR — evita round-trip en el cliente para el hero. */
export async function fetchPublicHeroVideoCached(): Promise<HeroVideo | null> {
  try {
    const res = await fetch(buildApiUrl("hero-video/public"), {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data ?? null;
  } catch {
    return null;
  }
}

// ── Admin (Studio) ───────────────────────────────────────────────────

export const getHeroVideo = (token: string): Promise<HeroVideo | null> =>
  apiFetch("hero-video", token);

export const uploadHeroVideo = (
  token: string,
  payload: {
    title?: string;
    /** Video desktop (formato principal). */
    file?: File;
    /** Video móvil opcional. */
    fileMobile?: File;
    clearMobile?: boolean;
  },
): Promise<HeroVideo> => {
  const form = new FormData();
  if (payload.file) form.append("video", payload.file);
  if (payload.fileMobile) form.append("videoMobile", payload.fileMobile);
  if (payload.title) form.append("title", payload.title);
  if (payload.clearMobile) form.append("clearMobile", "true");
  return apiFetch("hero-video", token, { method: "POST", body: form });
};

export const updateHeroVideo = (
  token: string,
  id: number,
  payload: { title?: string; isActive?: boolean },
): Promise<HeroVideo> =>
  apiFetch(`hero-video/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const deleteHeroVideo = (token: string, id: number): Promise<void> =>
  apiFetch(`hero-video/${id}`, token, { method: "DELETE" });
