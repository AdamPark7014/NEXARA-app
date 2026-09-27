/**
 * Descarga de archivos generados por la API (XML, CSV, PDF, XLSX).
 *
 * El enlace se inserta en el DOM y la URL se revoca un momento después:
 * revocarla en el mismo tick del clic cancela la descarga en Safari y Firefox.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Fecha local `YYYY-MM-DD` para nombres de archivo. */
export function todayStamp(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
