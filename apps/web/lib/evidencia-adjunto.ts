/**
 * Adjuntar una evidencia que ya existe (galería, archivo, captura, Ctrl+V, arrastrar).
 *
 * La foto de entrada y la de salida no pasan por aquí: esas siguen siendo solo cámara.
 * El campo de evidencia no admite PDF (la hoja de servicio tiene su propio paso).
 * La compresión es la de la cámara en vivo: lado mayor 1280 px, JPEG 0.6, y por
 * debajo del tope de 5 MB con el que el API guarda la foto.
 */

export const MAX_BORDE_PX = 1280;
export const CALIDAD_JPEG = 0.6;
/** Tope del archivo tal cual llega, antes de abrirlo. */
export const MAX_BYTES_CRUDO = 15 * 1024 * 1024;
/** Tope de `saveBase64Photo` en el API. */
export const MAX_BYTES_COMPRIMIDO = 5 * 1024 * 1024;

const EXTENSIONES_IMAGEN = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "bmp"]);

export type ArchivoAdjunto = {
  name?: string;
  type?: string;
  size: number;
};

export function tipoDeArchivo(type?: string, name?: string): "imagen" | "pdf" | "otro" {
  const mime = (type || "").toLowerCase().split(";")[0].trim();
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "imagen";
  const ext = (name || "").toLowerCase().split(".").pop() || "";
  if (ext === "pdf") return "pdf";
  if (EXTENSIONES_IMAGEN.has(ext)) return "imagen";
  return "otro";
}

/**
 * `null` si se puede usar. El PDF solo pasa cuando el campo lo admite; las fotos
 * de evidencia y de campo no lo admiten.
 */
export function mensajeAdjuntoInvalido(
  file: ArchivoAdjunto,
  opts?: { admitePdf?: boolean },
): string | null {
  if (!file || file.size <= 0) return "El archivo está vacío.";
  if (file.size > MAX_BYTES_CRUDO) {
    return "El archivo pesa más de 15 MB. Elige uno más pequeño.";
  }
  const tipo = tipoDeArchivo(file.type, file.name);
  if (tipo === "pdf") {
    return opts?.admitePdf
      ? null
      : "Esta evidencia solo acepta imagen (JPG, PNG, WEBP o GIF). El PDF se carga en la hoja de servicio.";
  }
  if (tipo !== "imagen") {
    return "Solo se admite una imagen (JPG, PNG, WEBP o GIF).";
  }
  return null;
}

/** Lado mayor a lo más `max` px. Devuelve `null` si el bitmap no tiene tamaño. */
export function bordeEscalado(
  ancho: number,
  alto: number,
  max = MAX_BORDE_PX,
): { ancho: number; alto: number } | null {
  if (!ancho || !alto || ancho < 0 || alto < 0) return null;
  const escala = Math.min(1, max / Math.max(ancho, alto));
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

/** Bytes aproximados del payload base64 de un data URL. */
export function bytesDeDataUrl(url: string): number {
  const i = url.indexOf(",");
  const b64 = i >= 0 ? url.slice(i + 1) : url;
  return Math.floor((b64.length * 3) / 4);
}

/**
 * GPS de una foto adjunta. Si no hay lectura, o es 0,0, no se guarda coordenada
 * (la evidencia sigue siendo válida). La entrada y la salida no usan esto.
 */
export function puntoDeFoto(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): { latitude: number; longitude: number } | null {
  if (latitude == null || longitude == null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

/** Primera imagen (o PDF, si luego se valida) de un drop o del portapapeles. */
export function primerArchivo(lista: ArrayLike<File> | null | undefined): File | null {
  if (!lista || lista.length === 0) return null;
  for (let i = 0; i < lista.length; i += 1) {
    const file = lista[i];
    if (!file) continue;
    const tipo = tipoDeArchivo(file.type, file.name);
    if (tipo === "imagen" || tipo === "pdf") return file;
  }
  return lista[0] ?? null;
}

type BitmapCerrable = { width: number; height: number; close?: () => void };

/**
 * JPEG data URL, mismo criterio que `grabFrame` de la cámara en vivo.
 * Baja la calidad si el resultado se pasa de 5 MB.
 */
export async function dataUrlDeImagen(file: Blob): Promise<string> {
  if (typeof document === "undefined") {
    throw new Error("No se pudo leer la imagen en este navegador.");
  }
  let bitmap: BitmapCerrable;
  let dibujar: CanvasImageSource;
  let revoke: (() => void) | null = null;
  if (typeof createImageBitmap === "function") {
    const creado = await createImageBitmap(file);
    bitmap = creado;
    dibujar = creado;
  } else {
    const url = URL.createObjectURL(file);
    revoke = () => URL.revokeObjectURL(url);
    const imagen = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo leer la imagen. Usa JPG o PNG."));
      img.src = url;
    }).finally(() => {
      revoke?.();
      revoke = null;
    });
    bitmap = { width: imagen.naturalWidth, height: imagen.naturalHeight };
    dibujar = imagen;
  }

  try {
    const size = bordeEscalado(bitmap.width, bitmap.height);
    if (!size) throw new Error("No se pudo leer la imagen. Usa JPG o PNG.");
    const canvas = document.createElement("canvas");
    canvas.width = size.ancho;
    canvas.height = size.alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar la imagen.");
    ctx.drawImage(dibujar, 0, 0, size.ancho, size.alto);
    let quality = CALIDAD_JPEG;
    let url = canvas.toDataURL("image/jpeg", quality);
    while (bytesDeDataUrl(url) > MAX_BYTES_COMPRIMIDO && quality > 0.35) {
      quality = Math.round((quality - 0.1) * 100) / 100;
      url = canvas.toDataURL("image/jpeg", quality);
    }
    if (bytesDeDataUrl(url) > MAX_BYTES_COMPRIMIDO) {
      throw new Error("La imagen sigue pesando más de 5 MB después de comprimirla. Elige otra.");
    }
    return url;
  } finally {
    bitmap.close?.();
    revoke?.();
  }
}
