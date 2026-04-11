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

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      if (base64) resolve(base64);
      else reject(new Error("blobToBase64: empty result"));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function shareWithTimeout(
  shareMod: { share: (opts: Record<string, unknown>) => Promise<unknown> },
  payload: { title: string; files?: string[]; url?: string; dialogTitle?: string },
  ms: number,
): Promise<void> {
  await Promise.race([
    shareMod.share(payload),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("share-timeout")), ms),
    ),
  ]);
}

/**
 * En Capacitor nativo: escribe el blob en el directorio caché y abre el menú compartir
 * del sistema operativo (Filesystem + Share). No depende de HTTP/HTTPS ni permisos de almacenamiento.
 */
async function nativeCapacitorSave(blob: Blob, fileName: string): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const base64 = await blobToBase64(blob);
    const safeName = fileName.replace(/[<>:"/\\|?*]/g, "_");
    await Filesystem.writeFile({ path: safeName, data: base64, directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: safeName });
    const dialogTitle = "Guardar o compartir";

    try {
      await shareWithTimeout(Share, { title: safeName, files: [uri], dialogTitle }, 15_000);
      return true;
    } catch (first) {
      if (Capacitor.getPlatform() === "android") {
        try {
          await shareWithTimeout(Share, { title: safeName, url: uri, dialogTitle }, 15_000);
          return true;
        } catch (second) {
          console.warn("[file-download] Share (url) falló:", second);
        }
      }
      console.warn("[file-download] Share (files) falló:", first);
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
    // Añadir timeout: navigator.share puede colgarse indefinidamente en WebViews de Capacitor
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
 * En Capacitor o móvil, prioriza `navigator.share` con `File` cuando el sistema lo permite.
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
      // En APK nativa: Filesystem + Share nativo (evita el cuelgue de navigator.share en WebView)
      if (isCapacitorNative()) {
        const saved = await nativeCapacitorSave(toShare, fileName);
        if (saved) return;
      }
      const result = await tryNavigatorShareFile(toShare, fileName);
      if (result === "shared" || result === "aborted") return;
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
    // En APK nativa: Filesystem + Share nativo (evita el cuelgue de navigator.share en WebView)
    if (isCapacitorNative()) {
      const saved = await nativeCapacitorSave(typed, fileName);
      if (saved) return;
    }
    const result = await tryNavigatorShareFile(typed, fileName);
    if (result === "shared" || result === "aborted") return;
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
