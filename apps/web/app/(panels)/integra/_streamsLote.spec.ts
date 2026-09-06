import { describe, expect, it, vi } from "vitest";

import {
  LOTE_MAX,
  abrirStreamsEnLote,
  repartirRespuestaLote,
  type RespuestaLote,
  type RespuestaStream,
} from "./_streamsLote";

/**
 * Abrir el muro es lo que más viajes costaba: una petición por cámara. Ahora va
 * en una sola contra `cameras/streams/batch`, pero con dos invariantes que no se
 * pueden perder:
 *
 * 1. **El orden de entrada manda**, porque decide qué celda ocupa cada cámara.
 * 2. **Un fallo por cámara no puede tumbar el muro.** Que la séptima no abra es
 *    un aviso junto a las otras doce, no un muro vacío. Eso es literalmente el
 *    «no se ven todas» que costó sangre arreglar.
 */

type Cam = { id: string; name: string };

const stream = (hls: string): RespuestaStream => ({ hls, rtsp: null });

const slot = (cam: Cam, data: RespuestaStream) => ({ id: cam.id, name: cam.name, hls: data.hls });

describe("apertura del muro en lote", () => {
  describe("reparto de la respuesta", () => {
    const camaras: Cam[] = [
      { id: "a", name: "Recepción" },
      { id: "b", name: "Azotea" },
      { id: "c", name: "Escalera" },
    ];

    it("respeta el orden de entrada aunque el backend conteste en otro", () => {
      const respuesta: RespuestaLote = {
        total: 3,
        ok: 3,
        failed: 0,
        items: [
          { cameraIndexCode: "c", ok: true, stream: stream("c.m3u8"), error: null },
          { cameraIndexCode: "a", ok: true, stream: stream("a.m3u8"), error: null },
          { cameraIndexCode: "b", ok: true, stream: stream("b.m3u8"), error: null },
        ],
      };
      const { abiertos, fallos } = repartirRespuestaLote(camaras, respuesta, slot);
      expect(abiertos.map((s) => s.id)).toEqual(["a", "b", "c"]);
      expect(fallos).toEqual([]);
    });

    it("una cámara que falla no se lleva por delante a las demás", () => {
      const respuesta: RespuestaLote = {
        total: 3,
        ok: 2,
        failed: 1,
        items: [
          { cameraIndexCode: "a", ok: true, stream: stream("a.m3u8"), error: null },
          { cameraIndexCode: "b", ok: false, stream: null, error: "no está en el espejo" },
          { cameraIndexCode: "c", ok: true, stream: stream("c.m3u8"), error: null },
        ],
      };
      const { abiertos, fallos } = repartirRespuestaLote(camaras, respuesta, slot);
      expect(abiertos.map((s) => s.id)).toEqual(["a", "c"]);
      expect(fallos).toEqual([{ name: "Azotea", reason: "no está en el espejo" }]);
    });

    it("una cámara que no vuelve en la respuesta es un fallo, no un silencio", () => {
      const respuesta: RespuestaLote = {
        total: 1,
        ok: 1,
        failed: 0,
        items: [{ cameraIndexCode: "a", ok: true, stream: stream("a.m3u8"), error: null }],
      };
      const { abiertos, fallos } = repartirRespuestaLote(camaras, respuesta, slot);
      expect(abiertos.map((s) => s.id)).toEqual(["a"]);
      expect(fallos.map((f) => f.name)).toEqual(["Azotea", "Escalera"]);
      expect(fallos[0].reason).toBe("no vino en la respuesta del lote");
    });

    it("un `ok: true` sin stream tampoco pinta un mosaico vacío", () => {
      const respuesta: RespuestaLote = {
        total: 1,
        ok: 1,
        failed: 0,
        items: [{ cameraIndexCode: "a", ok: true, stream: null, error: null }],
      };
      const { abiertos, fallos } = repartirRespuestaLote([camaras[0]], respuesta, slot);
      expect(abiertos).toEqual([]);
      expect(fallos).toEqual([{ name: "Recepción", reason: "no respondió" }]);
    });
  });

  describe("orquestación y respaldo", () => {
    const camaras: Cam[] = [
      { id: "a", name: "Recepción" },
      { id: "b", name: "Azotea" },
    ];

    it("con lote disponible NO se hace una petición por cámara", async () => {
      const unaAUna = vi.fn();
      const lote = vi.fn(async () => ({ abiertos: [{ id: "a" }, { id: "b" }], fallos: [] }));
      const r = await abrirStreamsEnLote(camaras, unaAUna, lote);
      expect(lote).toHaveBeenCalledTimes(1);
      expect(unaAUna).not.toHaveBeenCalled();
      expect(r.abiertos).toHaveLength(2);
    });

    it("si el lote entero se cae, se abre una a una: mejor N viajes que muro vacío", async () => {
      const unaAUna = vi.fn(async (c: Cam) => ({ id: c.id }));
      const lote = vi.fn(async () => {
        throw new Error("HTTP 404");
      });
      const r = await abrirStreamsEnLote(camaras, unaAUna, lote);
      expect(unaAUna).toHaveBeenCalledTimes(2);
      expect(r.abiertos.map((s) => s.id)).toEqual(["a", "b"]);
      expect(r.fallos).toEqual([]);
    });

    it("un fallo POR CÁMARA dentro de una respuesta buena no dispara el respaldo", async () => {
      const unaAUna = vi.fn();
      const lote = vi.fn(async () => ({
        abiertos: [{ id: "a" }],
        fallos: [{ name: "Azotea", reason: "no está en el espejo" }],
      }));
      const r = await abrirStreamsEnLote(camaras, unaAUna, lote);
      expect(unaAUna).not.toHaveBeenCalled();
      expect(r.fallos).toHaveLength(1);
    });

    it("por encima del tope del backend ni se intenta el lote", async () => {
      const muchas: Cam[] = Array.from({ length: LOTE_MAX + 1 }, (_, i) => ({
        id: `c${i}`,
        name: `Cámara ${i}`,
      }));
      const lote = vi.fn();
      const unaAUna = vi.fn(async (c: Cam) => ({ id: c.id }));
      await abrirStreamsEnLote(muchas, unaAUna, lote);
      expect(lote).not.toHaveBeenCalled();
      expect(unaAUna).toHaveBeenCalledTimes(LOTE_MAX + 1);
    });

    it("sin lote, las N peticiones salen a la vez y no en tandas encadenadas", async () => {
      let enVuelo = 0;
      let pico = 0;
      const unaAUna = async (c: Cam) => {
        enVuelo += 1;
        pico = Math.max(pico, enVuelo);
        await Promise.resolve();
        enVuelo -= 1;
        return { id: c.id };
      };
      const muchas: Cam[] = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: `${i}` }));
      await abrirStreamsEnLote(muchas, unaAUna);
      expect(pico).toBe(9);
    });

    it("recoge el motivo de cada fallo en vez de descartarlo en silencio", async () => {
      const unaAUna = async (c: Cam) => {
        if (c.id === "b") throw new Error("timeout RTSP");
        return { id: c.id };
      };
      const r = await abrirStreamsEnLote(camaras, unaAUna);
      expect(r.abiertos.map((s) => s.id)).toEqual(["a"]);
      expect(r.fallos).toEqual([{ name: "Azotea", reason: "timeout RTSP" }]);
    });

    it("sin cámaras no hay ni una petición", async () => {
      const unaAUna = vi.fn();
      const lote = vi.fn();
      const r = await abrirStreamsEnLote([], unaAUna, lote);
      expect(r).toEqual({ abiertos: [], fallos: [] });
      expect(unaAUna).not.toHaveBeenCalled();
      expect(lote).not.toHaveBeenCalled();
    });
  });
});
