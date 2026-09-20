import { describe, expect, it } from "vitest";

import {
  ETIQUETA_SLOT,
  NIVELES_COMBUSTIBLE,
  SLOTS_CHECKLIST,
  construirChecklistForm,
  nivelDeCombustible,
  pctDeCombustible,
  type ChecklistPayload,
  type MetaFoto,
} from "./vehiculos-api";

/**
 * El multipart del checklist. Lo que la API exige: los 7 archivos y un `meta`
 * con la hora de cada foto — sin hora, la foto se rechaza (así se rechaza una
 * imagen sacada de la galería).
 */

const CUANDO = "2026-09-19T10:00:00.000Z";

function foto(nombre: string): File {
  return new File([new Uint8Array([1, 2, 3])], `${nombre}.jpg`, { type: "image/jpeg" });
}

function payloadCompleto(cambios: Partial<ChecklistPayload> = {}): ChecklistPayload {
  const files: Record<string, File> = {};
  const meta: Record<string, MetaFoto> = {};
  SLOTS_CHECKLIST.forEach((slot, i) => {
    files[slot] = foto(slot);
    meta[slot] = { capturedAt: CUANDO, lat: 19.0414 + i / 1000, lng: -98.2063 };
  });
  return { files, meta, odometroKm: 120345, combustible: "3/4", ...cambios };
}

describe("construirChecklistForm", () => {
  it("manda los 7 archivos con el nombre de campo que espera la API", () => {
    const form = construirChecklistForm(payloadCompleto());

    for (const slot of SLOTS_CHECKLIST) {
      const archivo = form.get(slot);
      expect(archivo, `falta ${slot}`).toBeInstanceOf(File);
      expect((archivo as File).name).toBe(`${slot}.jpg`);
    }
    // Ni uno de más: 7 fotos + meta + odometroKm + combustible.
    expect([...form.keys()]).toHaveLength(SLOTS_CHECKLIST.length + 3);
  });

  it("el meta lleva capturedAt de cada foto y las coordenadas", () => {
    const form = construirChecklistForm(payloadCompleto());
    const meta = JSON.parse(String(form.get("meta")));

    expect(Object.keys(meta).sort()).toEqual([...SLOTS_CHECKLIST].sort());
    for (const slot of SLOTS_CHECKLIST) {
      expect(meta[slot].capturedAt).toBe(CUANDO);
      expect(typeof meta[slot].lat).toBe("number");
      expect(meta[slot].lng).toBe(-98.2063);
    }
  });

  it("sin permiso de ubicación la foto viaja con lat/lng en null, no ausentes", () => {
    const base = payloadCompleto();
    base.meta.frontal = { capturedAt: CUANDO, lat: null, lng: null };
    const meta = JSON.parse(String(construirChecklistForm(base).get("meta")));

    expect(meta.frontal).toEqual({ capturedAt: CUANDO, lat: null, lng: null });
  });

  it("km entero y combustible tal cual lo eligió la persona", () => {
    const form = construirChecklistForm(payloadCompleto({ odometroKm: 120345.9, combustible: "1/2" }));

    expect(form.get("odometroKm")).toBe("120345");
    expect(form.get("combustible")).toBe("1/2");
  });

  it("una foto sin hora no se envía: se para aquí y se dice cuál", () => {
    const base = payloadCompleto();
    base.meta.tablero = { capturedAt: "", lat: null, lng: null };

    expect(() => construirChecklistForm(base)).toThrow(/Tablero/);
  });

  it("si falta una foto, el error nombra el ángulo que falta", () => {
    const base = payloadCompleto();
    delete base.files["lateral-izq"];

    expect(() => construirChecklistForm(base)).toThrow(ETIQUETA_SLOT["lateral-izq"]);
  });
});

describe("niveles de combustible", () => {
  it("el selector va de E a F en cuartos", () => {
    expect(NIVELES_COMBUSTIBLE.map((n) => n.nivel)).toEqual(["E", "1/4", "1/2", "3/4", "F"]);
    expect(NIVELES_COMBUSTIBLE.map((n) => n.pct)).toEqual([0, 25, 50, 75, 100]);
  });

  it("del nivel al porcentaje, y de un número también", () => {
    expect(pctDeCombustible("E")).toBe(0);
    expect(pctDeCombustible("1/4")).toBe(25);
    expect(pctDeCombustible("F")).toBe(100);
    expect(pctDeCombustible(62)).toBe(62);
    expect(pctDeCombustible(null)).toBeNull();
    expect(pctDeCombustible("tres cuartos")).toBeNull();
    expect(pctDeCombustible(140)).toBeNull();
  });

  it("del porcentaje al nivel más cercano", () => {
    expect(nivelDeCombustible(0)).toBe("E");
    expect(nivelDeCombustible(26)).toBe("1/4");
    expect(nivelDeCombustible(60)).toBe("1/2");
    expect(nivelDeCombustible(99)).toBe("F");
    expect(nivelDeCombustible(null)).toBe("—");
  });
});
