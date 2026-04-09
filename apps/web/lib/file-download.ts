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

async function blobFromUrl(fileUrl: string, authToken?: string): Promise<Blob | null> {
  try {
    if (fileUrl.startsWith("blob:") || fileUrl.startsWith("data:")) {
      const res = await fetch(fileUrl);
      return await res.blob();
    }
    const headers: Record<string, string> = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const res = await fetch(fileUrl, { credentials: "include", headers });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
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
    await navigator.share(data);
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
 * Descarga o comparte el archivo (PWA / móvil: Web Share API cuando aplica).
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
      const result = await tryNavigatorShareFile(toShare, fileName);
      if (result === "shared" || result === "aborted") return;
    }
  }

  fallbackAnchorDownload(fileUrl, fileName);
}

export async function triggerBlobDownload(
  blob: Blob,
  fileName: string,
  options: Pick<DownloadOptions, "preferOpenOnMobile" | "mimeType"> = {},
): Promise<void> {
  if (typeof window === "undefined" || !blob?.size) return;
  const { preferOpenOnMobile = true, mimeType } = options;
  const typed =
    mimeType && (!blob.type || blob.type === "application/octet-stream")
      ? new Blob([blob], { type: mimeType })
      : blob;

  const nativeOrMobile =
    isCapacitorNative() || (preferOpenOnMobile && isLikelyMobileDevice());

  if (nativeOrMobile) {
    const result = await tryNavigatorShareFile(typed, fileName);
    if (result === "shared" || result === "aborted") return;
  }

  const objectUrl = URL.createObjectURL(typed);
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
