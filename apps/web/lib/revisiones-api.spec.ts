import { describe, expect, it } from "vitest";
import { coincideBusqueda, decisionUi, minutosEsperando, textoEspera, tonoEspera } from "./revisiones-api";

const ahora = new Date("2026-10-28T20:00:00Z").getTime();
const antes = (min: number) => new Date(ahora - min * 60_000).toISOString();

describe("cuánto lleva esperando", () => {
  it("cuenta minutos desde el envío", () => {
    expect(minutosEsperando(antes(95), ahora)).toBe(95);
    expect(minutosEsperando(null, ahora)).toBeNull();
    expect(minutosEsperando("no es fecha", ahora)).toBeNull();
  });

  it("un reloj adelantado no da espera negativa", () => {
    expect(minutosEsperando(new Date(ahora + 60_000).toISOString(), ahora)).toBe(0);
  });

  it("se dice en la unidad que importa", () => {
    expect(textoEspera(0)).toBe("hace un momento");
    expect(textoEspera(25)).toBe("hace 25 min");
    expect(textoEspera(3 * 60 + 40)).toBe("hace 3 h");
    expect(textoEspera(26 * 60)).toBe("hace 1 día");
    expect(textoEspera(3 * 24 * 60)).toBe("hace 3 días");
    expect(textoEspera(null)).toBe("Sin fecha de envío");
  });

  it("más de 4 h es ámbar y más de un día, rojo", () => {
    expect(tonoEspera(30)).toBe("success");
    expect(tonoEspera(4 * 60)).toBe("warning");
    expect(tonoEspera(24 * 60)).toBe("danger");
    expect(tonoEspera(null)).toBe("neutral");
  });
});

describe("decisión de la revisión", () => {
  it("en palabras y con su tono", () => {
    expect(decisionUi("APROBADA")).toEqual({ label: "Aprobada", tone: "success" });
    expect(decisionUi("DEVUELTA_TODO").tone).toBe("warning");
    expect(decisionUi("OTRA")).toEqual({ label: "OTRA", tone: "neutral" });
  });
});

describe("búsqueda", () => {
  const item = { anNumber: "AN-0331", titulo: "Instalación de cámaras", persona: { nombre: "Iván Domínguez" } };

  it("por folio, actividad o persona, sin acentos ni mayúsculas", () => {
    expect(coincideBusqueda(item, "an-0331")).toBe(true);
    expect(coincideBusqueda(item, "instalacion")).toBe(true);
    expect(coincideBusqueda(item, "IVAN")).toBe(true);
    expect(coincideBusqueda(item, "carolina")).toBe(false);
    expect(coincideBusqueda(item, "  ")).toBe(true);
  });
});
