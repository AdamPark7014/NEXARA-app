import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACEPTA_ADJUNTOS,
  ADJUNTO_MAX_BYTES,
  bajarArchivo,
  cuandoMx,
  extensionDe,
  iconoYColor,
  listarAdjuntos,
  metaDeAdjunto,
  quitarAdjunto,
  revisarAntesDeSubir,
  subirAdjuntos,
  tamanoLegible,
  vistaPrevia,
} from "@/lib/actividad-adjuntos-api";

afterEach(() => vi.unstubAllGlobals());

/** Miércoles 7 de octubre de 2026, 13:50 en México (UTC-6). */
const ahora = new Date("2026-10-07T19:50:00Z");

describe("iconoYColor", () => {
  it("PDF rojo, Excel y CSV verde, Word azul, imagen morado y el resto gris", () => {
    expect(iconoYColor("pdf")).toMatchObject({ icono: "pdf", etiqueta: "PDF", color: "#D93025" });
    expect(iconoYColor("excel")).toMatchObject({ icono: "hoja", etiqueta: "Excel" });
    expect(iconoYColor("csv").color).toBe(iconoYColor("excel").color);
    expect(iconoYColor("word")).toMatchObject({ icono: "documento", etiqueta: "Word" });
    expect(iconoYColor("imagen")).toMatchObject({ icono: "imagen", etiqueta: "Imagen" });
    expect(iconoYColor("otro")).toMatchObject({ icono: "archivo", etiqueta: "Archivo", color: "#6B7280" });
  });

  it("un tipo que no conoce (o ninguno) cae en «otro»", () => {
    expect(iconoYColor("pptx")).toEqual(iconoYColor("otro"));
    expect(iconoYColor(null)).toEqual(iconoYColor("otro"));
    expect(iconoYColor(undefined)).toEqual(iconoYColor("otro"));
  });
});

describe("tamanoLegible", () => {
  it("bytes, KB enteros y MB/GB con un decimal", () => {
    expect(tamanoLegible(0)).toBe("0 B");
    expect(tamanoLegible(512)).toBe("512 B");
    expect(tamanoLegible(1024)).toBe("1 KB");
    expect(tamanoLegible(340 * 1024)).toBe("340 KB");
    expect(tamanoLegible(2.3 * 1024 * 1024)).toBe("2.3 MB");
    expect(tamanoLegible(2 * 1024 * 1024)).toBe("2 MB");
    expect(tamanoLegible(25 * 1024 * 1024)).toBe("25 MB");
    expect(tamanoLegible(1.2 * 1024 * 1024 * 1024)).toBe("1.2 GB");
  });

  it("casi un MB ya se dice en MB (no «1024 KB»)", () => {
    expect(tamanoLegible(1024 * 1024 - 100)).toBe("1 MB");
  });

  it("sin tamaño, nada", () => {
    expect(tamanoLegible(null)).toBe("");
    expect(tamanoLegible(undefined)).toBe("");
    expect(tamanoLegible(Number.NaN)).toBe("");
    expect(tamanoLegible(-1)).toBe("");
  });
});

describe("cuandoMx", () => {
  it("se dice como lo dice la gente, en hora de México y 24 h (igual que Android)", () => {
    const ref = new Date("2026-10-07T20:00:00Z");
    expect(cuandoMx("2026-10-07T13:39:00Z", ref)).toBe("hoy 07:39");
    expect(cuandoMx("2026-10-07T00:11:00Z", ref)).toBe("ayer 18:11");
    expect(cuandoMx("2026-10-06T00:38:00Z", ref)).toBe("lun 5 oct 18:38");
    expect(cuandoMx("2025-10-06T20:00:00Z", ref)).toBe("lun 6 oct 2025 14:00");
  });

  it("el día lo marca México, no UTC: las 23:30 de ayer en México ya son hoy en UTC", () => {
    expect(cuandoMx("2026-10-07T05:30:00Z", ahora)).toBe("ayer 23:30");
    expect(cuandoMx("2026-10-07T06:00:00Z", ahora)).toBe("hoy 00:00");
  });

  it("sin fecha o con una ilegible, nada", () => {
    expect(cuandoMx(null, ahora)).toBe("");
    expect(cuandoMx("", ahora)).toBe("");
    expect(cuandoMx("no es fecha", ahora)).toBe("");
  });
});

describe("metaDeAdjunto", () => {
  it("tamaño · quien lo subió · cuándo, saltando lo que falte", () => {
    expect(
      metaDeAdjunto({ sizeBytes: 2.3 * 1024 * 1024, subidoPor: { id: 4, nombre: "Luis Joel" }, createdAt: "2026-10-07T19:39:00Z" }, ahora),
    ).toBe("2.3 MB · Luis Joel · hoy 13:39");
    expect(metaDeAdjunto({ sizeBytes: null, subidoPor: null, createdAt: "2026-10-07T19:39:00Z" }, ahora)).toBe("hoy 13:39");
  });
});

describe("revisarAntesDeSubir", () => {
  it("deja pasar lo que acepta la API y avisa de lo demás antes de subir", () => {
    const { listos, avisos } = revisarAntesDeSubir([
      { name: "Propuesta Toks.xlsx", size: 1200 },
      { name: "Minuta.DOCX", size: 5000 },
      { name: "video.mp4", size: 5000 },
      { name: "Planos.pdf", size: ADJUNTO_MAX_BYTES + 1 },
      { name: "vacío.csv", size: 0 },
    ]);
    expect(listos.map((a) => a.name)).toEqual(["Propuesta Toks.xlsx", "Minuta.DOCX"]);
    expect(avisos).toEqual([
      "No se puede adjuntar «video.mp4». Se aceptan PDF, Excel, Word, PowerPoint, imágenes y texto.",
      "«Planos.pdf» pesa 25 MB: el límite es 25 MB por archivo.",
      "«vacío.csv» está vacío.",
    ]);
  });

  it("25 MB exactos sí pasan", () => {
    expect(revisarAntesDeSubir([{ name: "a.pdf", size: ADJUNTO_MAX_BYTES }]).listos).toHaveLength(1);
  });

  it("el selector ofrece las mismas extensiones", () => {
    expect(ACEPTA_ADJUNTOS.split(",")).toContain(".xlsx");
    expect(ACEPTA_ADJUNTOS.split(",")).toContain(".heic");
    expect(extensionDe("Propuesta Toks.XLSX")).toBe("xlsx");
    expect(extensionDe("sin-extension")).toBe("");
  });
});

/* ─────────────────────────── Cliente HTTP ─────────────────────────── */

type Llamada = [string, RequestInit];
const respuesta = (cuerpo: BodyInit | null, status = 200, headers?: Record<string, string>) =>
  new Response(cuerpo, { status, headers });
const json = (v: unknown, status = 200) => respuesta(JSON.stringify(v), status, { "Content-Type": "application/json" });

function simular(...respuestas: Response[]) {
  const f = vi.fn(async (..._args: unknown[]) => respuestas.shift() ?? json([]));
  vi.stubGlobal("fetch", f);
  return f;
}

const llamada = (f: ReturnType<typeof simular>, i = 0) => f.mock.calls[i] as unknown as Llamada;
const auth = (init: RequestInit) => new Headers(init.headers).get("Authorization");

describe("listarAdjuntos", () => {
  it("pide la lista con la sesión", async () => {
    const f = simular(json([{ id: 1, nombre: "a.pdf" }]));
    expect(await listarAdjuntos("tok", 7)).toEqual([{ id: 1, nombre: "a.pdf" }]);
    const [url, init] = llamada(f);
    expect(url).toMatch(/\/activities\/7\/adjuntos$/);
    expect(auth(init)).toBe("Bearer tok");
    expect(init.credentials).toBe("include");
  });

  it("si la API falla, el mensaje legible de la API", async () => {
    simular(json({ message: "Actividad no encontrada" }, 404));
    await expect(listarAdjuntos("tok", 7)).rejects.toThrow("Actividad no encontrada");
  });
});

describe("subirAdjuntos", () => {
  const archivo = (nombre: string) => new File(["x"], nombre, { type: "application/octet-stream" });

  it("manda los archivos en el campo `files` y regresa los creados", async () => {
    const f = simular(json([{ id: 9, nombre: "Propuesta Toks.xlsx" }]));
    const creados = await subirAdjuntos("tok", 7, [archivo("Propuesta Toks.xlsx")]);
    expect(creados).toEqual([{ id: 9, nombre: "Propuesta Toks.xlsx" }]);
    const [url, init] = llamada(f);
    expect(url).toMatch(/\/activities\/7\/adjuntos$/);
    expect(init.method).toBe("POST");
    expect(auth(init)).toBe("Bearer tok");
    // Con FormData el navegador pone el boundary: no se fija Content-Type a mano.
    expect(new Headers(init.headers).get("Content-Type")).toBeNull();
    const cuerpo = init.body as FormData;
    expect(cuerpo.getAll("files").map((v) => (v as File).name)).toEqual(["Propuesta Toks.xlsx"]);
  });

  it("más de 10 se mandan en tandas de 10", async () => {
    const f = simular(json([{ id: 1 }]), json([{ id: 2 }]));
    const doce = Array.from({ length: 12 }, (_, i) => archivo(`f${i}.pdf`));
    expect(await subirAdjuntos("tok", 7, doce)).toEqual([{ id: 1 }, { id: 2 }]);
    expect(f).toHaveBeenCalledTimes(2);
    expect((llamada(f, 0)[1].body as FormData).getAll("files")).toHaveLength(10);
    expect((llamada(f, 1)[1].body as FormData).getAll("files")).toHaveLength(2);
  });

  it("403 con el mensaje de la API; 413 explicado", async () => {
    simular(json({ message: "Solo el equipo de la actividad o quien la gestiona puede adjuntar archivos" }, 403));
    await expect(subirAdjuntos("tok", 7, [archivo("a.pdf")])).rejects.toThrow(
      "Solo el equipo de la actividad o quien la gestiona puede adjuntar archivos",
    );
    simular(json({ message: "File too large" }, 413));
    await expect(subirAdjuntos("tok", 7, [archivo("a.pdf")])).rejects.toThrow("el límite es 25 MB por archivo");
  });

  it("si la respuesta no es JSON (proxy caído), un mensaje nuestro y no el HTML", async () => {
    simular(respuesta("<html>502 Bad Gateway</html>", 502));
    await expect(subirAdjuntos("tok", 7, [archivo("a.pdf")])).rejects.toThrow("No se pudo subir el archivo (HTTP 502)");
  });
});

describe("quitarAdjunto", () => {
  it("DELETE al adjunto con la sesión", async () => {
    const f = simular(json({ ok: true }));
    await quitarAdjunto("tok", 7, 31);
    const [url, init] = llamada(f);
    expect(url).toMatch(/\/activities\/7\/adjuntos\/31$/);
    expect(init.method).toBe("DELETE");
    expect(auth(init)).toBe("Bearer tok");
  });
});

describe("bajarArchivo y vistaPrevia", () => {
  it("baja los bytes de /archivo", async () => {
    const f = simular(respuesta("%PDF-1.7", 200, { "Content-Type": "application/pdf" }));
    const blob = await bajarArchivo("tok", 7, 31);
    expect(blob.size).toBe(8);
    expect(blob.type).toBe("application/pdf");
    expect(llamada(f)[0]).toMatch(/\/activities\/7\/adjuntos\/31\/archivo$/);
  });

  it("la vista previa llega como texto HTML", async () => {
    const f = simular(respuesta("<table><tr><td>1</td></tr></table>", 200, { "Content-Type": "text/html" }));
    expect(await vistaPrevia("tok", 7, 31)).toBe("<table><tr><td>1</td></tr></table>");
    expect(llamada(f)[0]).toMatch(/\/activities\/7\/adjuntos\/31\/vista-previa$/);
  });

  it("sin vista previa (400), el mensaje de la API", async () => {
    simular(json({ message: "No se pudo leer el archivo" }, 400));
    await expect(vistaPrevia("tok", 7, 31)).rejects.toThrow("No se pudo leer el archivo");
  });
});
