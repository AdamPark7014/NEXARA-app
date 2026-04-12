/**
 * Descarga un recurso como Blob informando progreso 0–100.
 * Si hay Content-Length y body en streaming, el % es real.
 * Si no, avanza por tiempo hasta ~90% y al terminar salta a 100%.
 */
export async function fetchBlobWithProgress(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  onProgress: (percent: number) => void,
): Promise<Blob> {
  onProgress(0);
  const res = await fetch(input, init);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const len = res.headers.get("Content-Length");
  const total = len ? parseInt(len, 10) : NaN;
  const body = res.body;

  if (body && Number.isFinite(total) && total > 0) {
    const reader = body.getReader();
    const chunks: BlobPart[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.length;
        onProgress(Math.min(99, Math.floor((loaded / total) * 100)));
      }
    }
    onProgress(100);
    const type = res.headers.get("content-type") || "application/octet-stream";
    return new Blob(chunks, { type });
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  let tick = 4;
  try {
    timer = setInterval(() => {
      tick = Math.min(tick + 5, 90);
      onProgress(tick);
    }, 380);
    const blob = await res.blob();
    return blob;
  } finally {
    if (timer) clearInterval(timer);
    onProgress(100);
  }
}
