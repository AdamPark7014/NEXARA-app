import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CAMPO_VIDEO_VUELTA,
  PASOS_CAPTURA,
  SLOTS_GUIADA,
  construirCapturaGuiadaForm,
  duracionVueltaValida,
  obtenerCapturaGuiada,
  revisarDano,
  tiemposCuadrosVuelta,
  unidadSigueFuera,
  vehiculosDeActividad,
  type CapturaGuiadaPayload,
} from "./vehiculos-captura";

/**
 * La captura guiada de 5 pasos tal como la espera la API: 8 cuadros de la vuelta + 4 fotos, el video
 * con su duración, `meta` con la hora de cada toma, `capturaVersion=2` y lo que leyó la IA.
 */

const CUANDO = "2026-11-21T16:00:00.000Z";

const blob = (tipo = "image/jpeg") => new Blob([new Uint8Array([1, 2, 3])], { type: tipo });

function completa(cambios: Partial<CapturaGuiadaPayload> = {}): CapturaGuiadaPayload {
  const files: CapturaGuiadaPayload["files"] = {};
  const meta: CapturaGuiadaPayload["meta"] = {};
  for (const slot of SLOTS_GUIADA) {
    files[slot] = blob();
    meta[slot] = { capturedAt: CUANDO, lat: 19.04, lng: -98.2 };
  }
  return {
    files,
    meta,
    video: blob("video/mp4"),
    videoMeta: { capturedAt: CUANDO, duracionSeg: 14.26 },
    odometroKm: 48215.7,
    combustible: "1/2",
    ...cambios,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("construirCapturaGuiadaForm", () => {
  it("manda los 12 archivos, el video, la versión 2 y el meta con la duración de la vuelta", () => {
    const form = construirCapturaGuiadaForm(completa({ lecturaIa: { odometroKm: 48215, combustiblePct: 50 } }));
    for (const slot of SLOTS_GUIADA) expect(form.get(slot)).toBeInstanceOf(Blob);
    expect((form.get(CAMPO_VIDEO_VUELTA) as File).name).toBe("video-vuelta.mp4");
    expect(form.get("capturaVersion")).toBe("2");
    expect(form.get("odometroKm")).toBe("48215");
    expect(form.get("combustible")).toBe("1/2");
    const meta = JSON.parse(String(form.get("meta")));
    expect(meta[CAMPO_VIDEO_VUELTA]).toEqual({ capturedAt: CUANDO, duracionSeg: 14.3 });
    expect(meta["vuelta-1"]).toEqual({ capturedAt: CUANDO, lat: 19.04, lng: -98.2 });
    expect(JSON.parse(String(form.get("lecturaIa")))).toEqual({ odometroKm: 48215, combustiblePct: 50 });
    expect(form.get("forzarKm")).toBeNull();
  });

  it("falla antes de mandar si falta el video, un cuadro o una hora", () => {
    expect(() => construirCapturaGuiadaForm(completa({ video: undefined as unknown as Blob }))).toThrow(/video/);
    const sinCuadro = completa();
    delete sinCuadro.files["vuelta-4"];
    expect(() => construirCapturaGuiadaForm(sinCuadro)).toThrow(/Trasera derecha/);
    const sinHora = completa();
    sinHora.meta["km-gasolina"] = undefined;
    expect(() => construirCapturaGuiadaForm(sinHora)).toThrow(/Kilometraje y gasolina/);
  });

  it("la vuelta debe durar de 10 a 20 s (con un segundo de gracia)", () => {
    expect(() => construirCapturaGuiadaForm(completa({ videoMeta: { capturedAt: CUANDO, duracionSeg: 6 } }))).toThrow(/entre 10 y 20/);
    expect(duracionVueltaValida(9)).toBe(true);
    expect(duracionVueltaValida(21)).toBe(true);
    expect(duracionVueltaValida(25)).toBe(false);
  });

  it("salida de inventario: manda actividad, encargado y, si Liz lo autoriza, forzarKm", () => {
    const form = construirCapturaGuiadaForm(completa({ actividadId: 40, encargadoId: 9, forzarKm: true }));
    expect(form.get("actividadId")).toBe("40");
    expect(form.get("encargadoId")).toBe("9");
    expect(form.get("forzarKm")).toBe("true");
  });

  it("0,0 no es una ubicación", () => {
    const p = completa();
    p.meta["tablero"] = { capturedAt: CUANDO, lat: 0, lng: 0 };
    const meta = JSON.parse(String(construirCapturaGuiadaForm(p).get("meta")));
    expect(meta.tablero).toEqual({ capturedAt: CUANDO, lat: null, lng: null });
  });
});

describe("tiemposCuadrosVuelta", () => {
  it("8 cuadros al centro de cada octavo: el primero cerca del frente, nunca en los extremos", () => {
    expect(tiemposCuadrosVuelta(16)).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
    const t = tiemposCuadrosVuelta(12.4);
    expect(t).toHaveLength(8);
    expect(t[0]).toBeGreaterThan(0);
    expect(t[7]).toBeLessThan(12.4);
    expect(tiemposCuadrosVuelta(0)).toEqual([]);
  });
});

describe("lecturas de la API", () => {
  it("sin pasos del servidor, usa los 5 de siempre", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ exigida: true }), { status: 200 })));
    const info = await obtenerCapturaGuiada("t", 3);
    expect(info.exigida).toBe(true);
    expect(info.pasos).toEqual(PASOS_CAPTURA);
    expect(String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toMatch(/vehicles\/captura-guiada\?vehiculo=3$/);
  });

  it("bloque de la actividad: rellena listas vacías", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ actividad: { id: 40, folio: "AN-0500", titulo: "x", estatus: "En proceso" }, usos: [{ id: 1, estatus: "En uso" }] }), {
          status: 200,
        }),
      ),
    );
    const r = await vehiculosDeActividad("t", 40);
    expect(r.usos[0].alertasKm).toEqual([]);
    expect(r.usos[0].incidencias).toEqual([]);
  });

  it("revisar un daño manda la decisión tal cual", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await revisarDano("t", 11, { accion: "descartar", motivo: "REFLEJO_O_SUCIEDAD", nota: "lodo" });
    expect(f.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ accion: "descartar", motivo: "REFLEJO_O_SUCIEDAD", nota: "lodo" });
  });
});

describe("unidadSigueFuera", () => {
  it("en uso, o con salida y sin devolución", () => {
    expect(unidadSigueFuera({ estatus: "En uso", salida: null, devolucion: null })).toBe(true);
    expect(unidadSigueFuera({ estatus: "Devuelto", salida: {} as never, devolucion: {} as never })).toBe(false);
  });
});
