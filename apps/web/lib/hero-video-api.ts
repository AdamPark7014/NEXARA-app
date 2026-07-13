/**
 * NEXARA · Hero Video API (frontend client)
 * ------------------------------------------
 * Consume `apps/api/src/hero-video/hero-video.controller.ts`.
 *
 * Endpoints:
 *   GET    /hero-video/public   ← público (sitio web), null si no hay video activo
 *   GET    /hero-video          ← admin (registro actual, si existe)
 *   POST   /hero-video          ← admin (multipart con `video`; reemplaza el anterior)
 *   PATCH  /hero-video/:id      ← admin (título / isActive)
 *   DELETE /hero-video/:id      ← admin
 */
import { buildApiUrl } from "@/lib/api-base";

export type HeroVideo = {
  id: number;
  videoUrl: string;
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

/** Resuelve la URL final del video (ruta relativa servida por el API). */
export function resolveHeroVideoUrl(videoUrl: string): string {
  if (!videoUrl) return "";
  if (/^https?:\/\//i.test(videoUrl)) return videoUrl;
  return buildApiUrl(videoUrl.replace(/^\//, ""));
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

// ── Admin (Studio) ───────────────────────────────────────────────────

export const getHeroVideo = (token: string): Promise<HeroVideo | null> =>
  apiFetch("hero-video", token);

export const uploadHeroVideo = (
  token: string,
  payload: { title?: string; file: File },
): Promise<HeroVideo> => {
  const form = new FormData();
  form.append("video", payload.file);
  if (payload.title) form.append("title", payload.title);
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
