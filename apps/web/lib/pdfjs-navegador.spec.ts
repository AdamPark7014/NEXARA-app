import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pdfjs = vi.hoisted(() => ({ GlobalWorkerOptions: { workerSrc: "" }, getDocument: () => null }));
vi.mock("pdfjs-dist", () => ({ default: pdfjs }));

const respuesta = (status: number) => ({ ok: status >= 200 && status < 300, status }) as Response;

async function nuevoModulo() {
  vi.resetModules();
  return import("./pdfjs-navegador");
}

describe("cargarPdfJs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pdfjs.GlobalWorkerOptions.workerSrc = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("con el worker arriba, carga pdf.js sin esperar y le da la ruta del worker", async () => {
    const http = vi.fn().mockResolvedValue(respuesta(200));
    vi.stubGlobal("fetch", http);
    const { cargarPdfJs } = await nuevoModulo();

    const cargado = await cargarPdfJs();

    expect(cargado.GlobalWorkerOptions.workerSrc).toBe("/pdf.worker.min.js");
    expect(http).toHaveBeenCalledTimes(1);
    expect(http).toHaveBeenCalledWith("/pdf.worker.min.js", { method: "HEAD", cache: "no-cache" });
  });

  it("aguanta el 502 de un despliegue y no toca pdf.js hasta que el worker responde", async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce(respuesta(502))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(respuesta(200));
    vi.stubGlobal("fetch", http);
    const { cargarPdfJs } = await nuevoModulo();

    const carga = cargarPdfJs();
    await vi.advanceTimersByTimeAsync(499);
    expect(http).toHaveBeenCalledTimes(1);
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe("");

    await vi.advanceTimersByTimeAsync(1_501);
    const cargado = await carga;

    expect(http).toHaveBeenCalledTimes(3);
    expect(cargado.GlobalWorkerOptions.workerSrc).toBe("/pdf.worker.min.js");
  });

  it("vuelve a comprobar el worker en cada documento, porque pdf.js crea uno por documento", async () => {
    const http = vi.fn().mockResolvedValue(respuesta(200));
    vi.stubGlobal("fetch", http);
    const { cargarPdfJs } = await nuevoModulo();

    await cargarPdfJs();
    await cargarPdfJs();

    expect(http).toHaveBeenCalledTimes(2);
  });

  it("si nunca responde da un error claro, y un intento posterior puede salir bien", async () => {
    const http = vi.fn().mockResolvedValue(respuesta(502));
    vi.stubGlobal("fetch", http);
    const { cargarPdfJs } = await nuevoModulo();

    const carga = cargarPdfJs();
    const rechazo = expect(carga).rejects.toThrow("No se pudo cargar el visor de PDF");
    await vi.advanceTimersByTimeAsync(15_500);
    await rechazo;
    expect(http).toHaveBeenCalledTimes(6);

    http.mockResolvedValue(respuesta(200));
    await expect(cargarPdfJs()).resolves.toBeTruthy();
  });
});

describe("workerAtorado", () => {
  it("reconoce el fallo que pdf.js guarda para siempre, y nada más", async () => {
    const { workerAtorado } = await nuevoModulo();

    expect(
      workerAtorado(
        new Error('Setting up fake worker failed: "Cannot load script at: https://core.nexara.com.mx/pdf.worker.min.js".'),
      ),
    ).toBe(true);
    expect(workerAtorado(new Error("Invalid PDF structure."))).toBe(false);
    expect(workerAtorado("Setting up fake worker failed")).toBe(false);
  });
});
