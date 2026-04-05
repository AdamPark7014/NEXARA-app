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

  if (shouldOpenMobile) {
    const popup = window.open(fileUrl, "_blank", "noopener,noreferrer");
    if (popup) return;
  }

  const link = document.createElement("a");
  link.href = fileUrl;
  link.rel = "noopener noreferrer";

  if (!shouldOpenMobile) {
    link.download = fileName;
  } else {
    link.target = "_blank";
  }

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (shouldOpenMobile) {
    // Fallback para WebViews que bloquean click programático sin gesto directo.
    setTimeout(() => {
      try {
        window.location.href = fileUrl;
      } catch {
        // Ignore navigation fallback errors.
      }
    }, 120);
  }
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
