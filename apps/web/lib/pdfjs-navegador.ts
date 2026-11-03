export type PdfJs = typeof import("pdfjs-dist");

/** El worker vive en `public/` y es de la misma versión que el paquete (3.11.174). */
const WORKER_SRC = "/pdf.worker.min.js";

/** Cubren el reinicio de la web en un despliegue, que da 502 unos segundos. */
const ESPERAS_MS = [500, 1_000, 2_000, 4_000, 8_000];

export const MENSAJE_WORKER_ATORADO =
  "El visor de PDF no cargó. Oprime Reintentar para recargar la página; lo guardado no se pierde.";

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function workerResponde(): Promise<boolean> {
  try {
    return (await fetch(WORKER_SRC, { method: "HEAD", cache: "no-cache" })).ok;
  } catch {
    return false;
  }
}

/**
 * Si el worker falla una sola vez, pdf.js guarda ese rechazo para siempre
 * (`_setupFakeWorkerGlobal`) y nada vuelve a dibujar hasta recargar la página. Bastó un 502 de un
 * segundo durante un despliegue (03-11-2026). Por eso se comprueba antes de cada documento: pdf.js
 * crea un Worker nuevo por documento, así que una página abierta vuelve a pedir el archivo.
 */
async function esperarWorker(): Promise<void> {
  if (await workerResponde()) return;
  for (const ms of ESPERAS_MS) {
    await esperar(ms);
    if (await workerResponde()) return;
  }
  throw new Error("No se pudo cargar el visor de PDF. Revisa tu conexión y reintenta.");
}

let pdfjsCargado: Promise<PdfJs> | null = null;

/** pdf.js se carga una vez y solo en el navegador; el worker se comprueba en cada llamada. */
export async function cargarPdfJs(): Promise<PdfJs> {
  await esperarWorker();
  if (!pdfjsCargado) {
    pdfjsCargado = import("pdfjs-dist")
      .then((m) => {
        const pdfjs = ((m as unknown as { default?: PdfJs }).default ?? m) as PdfJs;
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
        return pdfjs;
      })
      .catch((e: unknown) => {
        // Un trozo de JS que no llegó en un despliegue no debe quedar guardado como rechazo.
        pdfjsCargado = null;
        throw e;
      });
  }
  return pdfjsCargado;
}

/** pdf.js ya guardó el fallo del worker: solo recargar la página lo limpia. */
export function workerAtorado(e: unknown): boolean {
  return e instanceof Error && /fake worker/i.test(e.message);
}
