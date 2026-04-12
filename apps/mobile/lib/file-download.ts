import { isCapacitorNative } from "./capacitor-env";

const MOBILE_UA_REGEX = /android|iphone|ipad|ipod|mobile/i;

const isLikelyMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  return MOBILE_UA_REGEX.test(navigator.userAgent || "");
};

export type DownloadOptions = {
  preferOpenOnMobile?: boolean;
  /** Para URLs https al API que requieren JWT */
  authToken?: string;
  mimeType?: string;
};

type ShareAttempt = "shared" | "aborted" | "unsupported";

/**
 * Base64 para Filesystem.writeFile (nativo) sin readAsDataURL:
 * menos memoria que data:...;base64, y cede el hilo para no congelar el visor PDF.
 */
async function blobToBase64ForFilesystem(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, bytes.length);
    const slice = bytes.subarray(i, end);
    parts.push(String.fromCharCode.apply(null, slice as unknown as number[]));
    if (i > 0 && i % (chunkSize * 6) === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  await new Promise((r) => setTimeout(r, 0));
  return btoa(parts.join(""));
}

async function shareWithTimeout(
  shareMod: { share: (opts: Record<string, unknown>) => Promise<unknown> },
  payload: { title: string; files?: string[]; url?: string; dialogTitle?: string; text?: string },
  ms: number,
): Promise<void> {
  await Promise.race([
    shareMod.share(payload),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("share-timeout")), ms),
    ),
  ]);
}

function writeResultUri(wr: unknown): string | null {
  if (wr && typeof wr === "object" && "uri" in wr) {
    const u = (wr as { uri?: unknown }).uri;
    if (typeof u === "string" && u.length > 0) return u;
  }
  return null;
}

/**
 * En Capacitor nativo: escribe el blob en caché (o caché externa) y abre el sheet de compartir.
 * Evita navigator.share en el WebView con PDF (suele colgarse o no hacer nada).
 */
async function nativeCapacitorSave(blob: Blob, fileName: string): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const base64 = await blobToBase64ForFilesystem(blob);
    const safeSegment = fileName.replace(/[<>:"/\\|?*]/g, "_").slice(0, 160);
    const path = `nexara_${Date.now()}_${safeSegment || "archivo.bin"}`;
    const dialogTitle = "Guardar o compartir";

    const directories =
      Capacitor.getPlatform() === "android"
        ? [Directory.ExternalCache, Directory.Cache]
        : [Directory.Cache, Directory.ExternalCache];

    for (const directory of directories) {
      let uri: string | null = null;
      try {
        const wr = await Filesystem.writeFile({ path, data: base64, directory });
        uri = writeResultUri(wr);
        if (!uri) {
          const got = await Filesystem.getUri({ directory, path });
          uri = got.uri;
        }
      } catch (writeErr) {
        console.warn("[file-download] writeFile omitido en directorio", directory, writeErr);
        continue;
      }

      if (!uri) continue;

      try {
        await shareWithTimeout(
          Share,
          {
            title: safeSegment,
            files: [uri],
            dialogTitle,
            text: safeSegment,
          },
          22_000,
        );
        return true;
      } catch (first) {
        if (Capacitor.getPlatform() === "android") {
          try {
            await shareWithTimeout(
              Share,
              { title: safeSegment, url: uri, dialogTitle, text: safeSegment },
              22_000,
            );
            return true;
          } catch (second) {
            console.warn("[file-download] Share (url) falló:", second);
          }
        } else {
          console.warn("[file-download] Share (files) falló:", first);
        }
      }

      try {
        await Filesystem.deleteFile({ path, directory });
      } catch {
        /* ignore */
      }
    }

    return false;
  } catch (e) {
    console.warn("[file-download] Capacitor Filesystem/Share no disponible:", e);
    return false;
  }
}

/** WebView a veces no muestra el sheet de compartir para PDF; abrir el blob suele funcionar con gesto de usuario. */
function tryOpenBlobInSystemViewer(objectUrl: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const w = window.open(objectUrl, "_blank", "noopener,noreferrer");
    return Boolean(w);
  } catch {
    return false;
  }
}

async function blobFromUrl(fileUrl: string, authToken?: string): Promise<Blob | null> {
  try {
    if (fileUrl.startsWith("blob:") || fileUrl.startsWith("data:")) {
      const res = await fetch(fileUrl);
      return await res.blob();
    }
    const headers: Record<string, string> = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const res = await fetch(fileUrl, { credentials: "include", headers });
    if (!res.ok) {
      console.warn("[file-download] fetch blob falló:", res.status, fileUrl.slice(0, 120));
      return null;
    }
    return await res.blob();
  } catch (e) {
    console.warn("[file-download] fetch blob error:", e instanceof Error ? e.message : e, fileUrl.slice(0, 120));
    return null;
  }
}

async function tryNavigatorShareFile(blob: Blob, fileName: string): Promise<ShareAttempt> {
  try {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      return "unsupported";
    }
    const type = blob.type || "application/octet-stream";
    const file = new File([blob], fileName, { type });
    const data: ShareData = { title: fileName, files: [file] };
    if (typeof navigator.canShare === "function" && !navigator.canShare(data)) {
      return "unsupported";
    }
    await Promise.race([
      navigator.share(data),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("share-timeout")), 8_000),
      ),
    ]);
    return "shared";
  } catch (e) {
    if ((e as Error).name === "AbortError") return "aborted";
    return "unsupported";
  }
}

function fallbackAnchorDownload(fileUrl: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = fileUrl;
  link.rel = "noopener noreferrer";
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Descarga o abre el selector nativo (iOS Archivos / Android compartir) para guardar el archivo.
 * En app Capacitor: Filesystem + Share nativos; no usar Web Share API en el WebView (especialmente con PDF).
 */
export async function triggerFileDownload(
  fileUrl: string,
  fileName: string,
  options: DownloadOptions = {},
): Promise<void> {
  if (typeof window === "undefined" || !fileUrl) return;

  const { preferOpenOnMobile = true, authToken, mimeType } = options;
  const nativeOrMobile =
    isCapacitorNative() || (preferOpenOnMobile && isLikelyMobileDevice());

  if (nativeOrMobile) {
    const blob = await blobFromUrl(fileUrl, authToken);
    if (blob && blob.size > 0) {
      const toShare =
        mimeType && (!blob.type || blob.type === "application/octet-stream")
          ? new Blob([blob], { type: mimeType })
          : blob;
      if (isCapacitorNative()) {
        const saved = await nativeCapacitorSave(toShare, fileName);
        if (saved) return;
      } else {
        const result = await tryNavigatorShareFile(toShare, fileName);
        if (result === "shared" || result === "aborted") return;
      }
      const previewUrl = URL.createObjectURL(toShare);
      if (isCapacitorNative() && tryOpenBlobInSystemViewer(previewUrl)) {
        revokeObjectUrlLater(previewUrl, 300_000);
        return;
      }
      URL.revokeObjectURL(previewUrl);
    }
  }

  fallbackAnchorDownload(fileUrl, fileName);
}

/**
 * Cuando ya tienes el Blob (p. ej. Excel o PDF en memoria).
 */
export async function triggerBlobDownload(
  blob: Blob,
  fileName: string,
  options: Pick<DownloadOptions, "preferOpenOnMobile" | "mimeType"> = {},
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!blob?.size) {
    console.warn("[file-download] triggerBlobDownload: blob vacío", fileName);
    return;
  }
  const { preferOpenOnMobile = true, mimeType } = options;
  const typed =
    mimeType && (!blob.type || blob.type === "application/octet-stream")
      ? new Blob([blob], { type: mimeType })
      : blob;

  const nativeOrMobile =
    isCapacitorNative() || (preferOpenOnMobile && isLikelyMobileDevice());

  if (nativeOrMobile) {
    if (isCapacitorNative()) {
      await new Promise((r) => setTimeout(r, 0));
      const saved = await nativeCapacitorSave(typed, fileName);
      if (saved) return;
    } else {
      const result = await tryNavigatorShareFile(typed, fileName);
      if (result === "shared" || result === "aborted") return;
    }
    if (isCapacitorNative()) {
      const previewUrl = URL.createObjectURL(typed);
      if (tryOpenBlobInSystemViewer(previewUrl)) {
        revokeObjectUrlLater(previewUrl, 300_000);
        return;
      }
      URL.revokeObjectURL(previewUrl);
    }
  }

  const objectUrl = URL.createObjectURL(typed);
  if (isCapacitorNative() && tryOpenBlobInSystemViewer(objectUrl)) {
    revokeObjectUrlLater(objectUrl, 300_000);
    return;
  }
  try {
    fallbackAnchorDownload(objectUrl, fileName);
  } finally {
    revokeObjectUrlLater(objectUrl, 120_000);
  }
}

export const revokeObjectUrlLater = (objectUrl?: string | null, delayMs = 60000) => {
  if (!objectUrl || typeof window === "undefined") return;
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      /* ignore */
    }
  }, delayMs);
};
