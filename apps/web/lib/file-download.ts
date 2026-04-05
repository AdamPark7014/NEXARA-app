const MOBILE_UA_REGEX = /android|iphone|ipad|ipod|mobile/i;

const isLikelyMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  return MOBILE_UA_REGEX.test(navigator.userAgent || "");
};

type DownloadOptions = {
  preferOpenOnMobile?: boolean;
};

export const triggerFileDownload = (
  fileUrl: string,
  fileName: string,
  options: DownloadOptions = {},
) => {
  if (typeof window === "undefined" || !fileUrl) return;

  const { preferOpenOnMobile = true } = options;
  const shouldOpenMobile = preferOpenOnMobile && isLikelyMobileDevice();

  const link = document.createElement("a");
  link.href = fileUrl;
  link.rel = "noopener noreferrer";

  // On mobile, prefer real download to avoid clipped viewers and missing saved files.
  link.download = fileName;

  // Keep compatibility: open in a new tab only when explicitly needed.
  if (shouldOpenMobile && !fileName) {
    link.target = "_blank";
  }

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const revokeObjectUrlLater = (objectUrl?: string | null, delayMs = 60000) => {
  if (!objectUrl || typeof window === "undefined") return;
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Ignore revoke failures.
    }
  }, delayMs);
};
