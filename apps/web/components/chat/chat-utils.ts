import { buildApiUrl, getApiAssetOrigin } from "@/lib/api-base";
import type { ChannelKind, Message, ReactionUser } from "./types";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

export function isImageAttachment(name: string) {
  return IMAGE_EXT.test(name);
}

export function attachmentHref(url: string) {
  return `${getApiAssetOrigin()}${url}`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Reacciones de un toque, las tres que más se usan. El resto va en el selector. */
export const REACCIONES_RAPIDAS = ["👍", "✅", "👀"];

export const FAVORITES_KEY = "nexara.chat.favorites";
export const DRAFTS_KEY = "nexara.chat.drafts";
/** Secciones plegadas de la barra lateral; vive en el navegador igual que los favoritos. */
export const SECTIONS_KEY = "nexara.chat.sections";

export function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  });
}

export function formatMexicoDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function mergeMessage(prev: Message, incoming: Message): Message {
  return {
    ...prev,
    ...incoming,
    receipt: incoming.receipt ?? prev.receipt ?? null,
  };
}

export function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** «Hoy · viernes 2 de octubre», «Ayer · …» o solo la fecha larga. */
export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const largo = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  if (dayKey(iso) === dayKey(today.toISOString())) return `Hoy · ${largo}`;
  if (dayKey(iso) === dayKey(yest.toISOString())) return `Ayer · ${largo}`;
  return largo;
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 45) return "ahora";
  const min = Math.round(diffSec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `hace ${day} d`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/** Resumen corto para el tooltip al pasar el mouse sobre una reacción. */
export function summarizeReactors(users?: ReactionUser[]): string {
  const names = (users ?? []).map((u) => u.nombre).filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names[0]}, ${names[1]} y ${names.length - 2} más`;
}

/** Busca un mensaje por id entre la lista principal y el panel de hilo. */
export function findMessageInLists(
  id: number,
  lists: Array<Message[] | Message | null | undefined>,
): Message | undefined {
  for (const l of lists) {
    if (!l) continue;
    if (Array.isArray(l)) {
      const found = l.find((m) => m.id === id);
      if (found) return found;
    } else if (l.id === id) {
      return l;
    }
  }
  return undefined;
}

/** Prefijo de texto (placeholders): solo los públicos llevan "#". */
export function channelPrefix(kind: ChannelKind) {
  return kind === "PUBLIC" ? "#" : "";
}

/** Preview de canal legible: `[@Nombre](user:2)` → `@Nombre`, `[etiqueta](/ruta)` → `etiqueta`, sin emojis. */
export function readableChatPreview(body: string): string {
  const limpio = body
    .replace(/\[@?([^\]\n]+)\]\(user:\d+\)/g, "@$1")
    .replace(/\[([^\]\n]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\p{Extended_Pictographic}️?\s?/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  // Un sticker es solo emoji: quitarlos dejaba la fila del canal en blanco.
  if (!limpio && body.trim()) return body.trim();
  return limpio;
}
