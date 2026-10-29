/**
 * El croquis que sube el encargado, listo para el plano: un PDF (lo que exporta AutoCAD) se pasa a
 * imagen con pdf.js en el navegador (primera hoja, ~3000 px de ancho) y una imagen enorme se
 * reduce. Se sube como PNG; la API solo recibe imágenes.
 */
type PdfJs = typeof import("pdfjs-dist");

let pdfjsCargado: Promise<PdfJs> | null = null;
function cargarPdfJs(): Promise<PdfJs> {
  if (!pdfjsCargado) {
    pdfjsCargado = import("pdfjs-dist").then((m) => {
      const pdfjs = ((m as unknown as { default?: PdfJs }).default ?? m) as PdfJs;
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
      return pdfjs;
    });
  }
  return pdfjsCargado;
}

export const ANCHO_CROQUIS_PX = 3000;
const MAXIMO_LADO_PX = 6000;

export const TIPOS_CROQUIS = "image/png,image/jpeg,image/webp,application/pdf,.pdf,.jpg,.jpeg,.png,.webp";

function aPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo preparar la imagen del croquis."))), "image/png"),
  );
}

async function desdePdf(archivo: File): Promise<Blob> {
  const pdfjs = await cargarPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise;
  const hoja = await doc.getPage(1);
  const base = hoja.getViewport({ scale: 1 });
  const vista = hoja.getViewport({ scale: ANCHO_CROQUIS_PX / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vista.width);
  canvas.height = Math.round(vista.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador no puede preparar el croquis.");
  await hoja.render({ canvasContext: ctx, viewport: vista }).promise;
  return aPng(canvas);
}

async function desdeImagen(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo);
  const lado = Math.max(bitmap.width, bitmap.height);
  if (lado <= MAXIMO_LADO_PX && archivo.type === "image/png") return archivo;
  const k = Math.min(1, MAXIMO_LADO_PX / lado);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador no puede preparar el croquis.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return aPng(canvas);
}

/**
 * ¿El croquis es de fondo oscuro? Los PDF de AutoCAD salen en negro con trazos claros y en el tema
 * claro de Core el plano se vería gris; esos se pintan invertidos (trazos oscuros sobre blanco).
 */
export async function esOscuro(imagen: Blob): Promise<boolean> {
  const bitmap = await createImageBitmap(imagen);
  const lado = 64;
  const canvas = document.createElement("canvas");
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(bitmap, 0, 0, lado, lado);
  const { data } = ctx.getImageData(0, 0, lado, lado);
  let suma = 0;
  for (let i = 0; i < data.length; i += 4) suma += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return suma / (data.length / 4) < 0.4 * 255;
}

export function esPdf(archivo: File): boolean {
  return archivo.type === "application/pdf" || /\.pdf$/i.test(archivo.name);
}

/** PNG listo para subir. */
export async function prepararCroquis(archivo: File): Promise<Blob> {
  if (archivo.size > 40 * 1024 * 1024) throw new Error("El croquis pesa más de 40 MB; expórtalo más ligero.");
  return esPdf(archivo) ? desdePdf(archivo) : desdeImagen(archivo);
}
