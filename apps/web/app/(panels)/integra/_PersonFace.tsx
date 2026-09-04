"use client";

import { useEffect, useState } from "react";
import { integraPersonFaceBlob } from "./_lib";

/**
 * Foto de persona ACS: prioriza captura del evento (`photoPath`), si no hay
 * baja el JPEG enrolado vía proxy con headers de tenant (local NEXARA o faceURL).
 */

const blobCache = new Map<string, { url: string; at: number }>();
const CACHE_TTL_MS = 120_000;

function cachedObjectUrl(personId: string): string | null {
  const hit = blobCache.get(personId);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    URL.revokeObjectURL(hit.url);
    blobCache.delete(personId);
    return null;
  }
  return hit.url;
}

export function prefetchPersonFace(personId: string): void {
  const id = String(personId || "").trim();
  if (!id || cachedObjectUrl(id)) return;
  void integraPersonFaceBlob(id)
    .then((blob) => {
      const prev = blobCache.get(id);
      if (prev) URL.revokeObjectURL(prev.url);
      blobCache.set(id, { url: URL.createObjectURL(blob), at: Date.now() });
    })
    .catch(() => undefined);
}

export function invalidatePersonFaceCache(personId?: string): void {
  if (!personId) {
    for (const v of blobCache.values()) URL.revokeObjectURL(v.url);
    blobCache.clear();
    return;
  }
  const hit = blobCache.get(personId);
  if (hit) {
    URL.revokeObjectURL(hit.url);
    blobCache.delete(personId);
  }
}

type Size = "sm" | "md" | "lg" | "xl";

export function PersonFaceThumb({
  personId,
  personName,
  photoPath,
  className,
  size = "md",
  bust,
}: {
  personId?: string | null;
  personName?: string | null;
  /** Captura del evento (/uploads/…) si existe. */
  photoPath?: string | null;
  className?: string;
  size?: Size;
  /** Cambia tras subir foto para forzar re-fetch. */
  bust?: number | string;
}) {
  const [src, setSrc] = useState<string | null>(photoPath || null);
  const [fromBlob, setFromBlob] = useState(false);
  const initial = (personName || personId || "?").slice(0, 1).toUpperCase();

  useEffect(() => {
    if (photoPath) {
      setSrc(photoPath);
      setFromBlob(false);
      return;
    }
    const id = String(personId || "").trim();
    if (!id) {
      setSrc(null);
      return;
    }
    const cached = cachedObjectUrl(id);
    if (cached) {
      setSrc(cached);
      setFromBlob(true);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(null);
    void integraPersonFaceBlob(id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        const prev = blobCache.get(id);
        if (prev) URL.revokeObjectURL(prev.url);
        blobCache.set(id, { url: objectUrl, at: Date.now() });
        setSrc(objectUrl);
        setFromBlob(true);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      // No revoke objectUrl si quedó en cache.
    };
  }, [personId, photoPath, bust]);

  return (
    <div
      className={className}
      data-empty={!src ? "1" : undefined}
      data-size={size}
      data-source={photoPath ? "event" : fromBlob ? "enrolled" : "none"}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" />
      ) : (
        <span aria-hidden>{initial}</span>
      )}
    </div>
  );
}
