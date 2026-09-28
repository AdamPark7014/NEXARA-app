import { describe, expect, it } from "vitest";
import {
  bordeEscalado,
  bytesDeDataUrl,
  mensajeAdjuntoInvalido,
  primerArchivo,
  puntoDeFoto,
  tipoDeArchivo,
} from "./evidencia-adjunto";

describe("evidencia adjunta", () => {
  it("acepta jpg, png, webp y gif, y un tipo vacío con extensión de imagen", () => {
    expect(mensajeAdjuntoInvalido({ type: "image/jpeg", size: 1200, name: "a.jpg" })).toBeNull();
    expect(mensajeAdjuntoInvalido({ type: "image/png", size: 1200, name: "a.png" })).toBeNull();
    expect(mensajeAdjuntoInvalido({ type: "image/webp", size: 1200 })).toBeNull();
    expect(mensajeAdjuntoInvalido({ type: "image/gif", size: 80, name: "a.gif" })).toBeNull();
    expect(mensajeAdjuntoInvalido({ type: "", size: 80, name: "captura.PNG" })).toBeNull();
    expect(tipoDeArchivo("image/heic", "foto.heic")).toBe("imagen");
  });

  it("rechaza PDF en la foto de evidencia y lo deja pasar si el campo lo admite", () => {
    expect(mensajeAdjuntoInvalido({ type: "application/pdf", size: 2000, name: "hoja.pdf" })).toMatch(/solo acepta imagen/i);
    expect(mensajeAdjuntoInvalido({ type: "", size: 2000, name: "hoja.PDF" })).toMatch(/hoja de servicio/i);
    expect(mensajeAdjuntoInvalido({ type: "application/pdf", size: 2000, name: "hoja.pdf" }, { admitePdf: true })).toBeNull();
  });

  it("rechaza lo que no es imagen, el archivo vacío y lo que pasa de 15 MB", () => {
    expect(mensajeAdjuntoInvalido({ type: "text/plain", size: 20, name: "nota.txt" })).toMatch(/solo se admite una imagen/i);
    expect(mensajeAdjuntoInvalido({ type: "image/jpeg", size: 0, name: "vacio.jpg" })).toMatch(/vacío/i);
    expect(mensajeAdjuntoInvalido({ type: "image/jpeg", size: 15 * 1024 * 1024 + 1, name: "grande.jpg" })).toMatch(/15 MB/i);
  });

  it("escala el lado mayor a 1280 y no agranda una foto chica", () => {
    expect(bordeEscalado(4000, 2000)).toEqual({ ancho: 1280, alto: 640 });
    expect(bordeEscalado(800, 600)).toEqual({ ancho: 800, alto: 600 });
    expect(bordeEscalado(0, 400)).toBeNull();
  });

  it("no guarda 0,0 ni una coordenada a medias", () => {
    expect(puntoDeFoto(19.43, -99.13)).toEqual({ latitude: 19.43, longitude: -99.13 });
    expect(puntoDeFoto(0, 0)).toBeNull();
    expect(puntoDeFoto(null, -99)).toBeNull();
    expect(puntoDeFoto(91, 0.1)).toBeNull();
  });

  it("toma la primera imagen del drop y estima el peso del data URL", () => {
    const pdf = new File(["%PDF"], "hoja.pdf", { type: "application/pdf" });
    const png = new File(["x"], "captura.png", { type: "image/png" });
    expect(primerArchivo([pdf, png])?.name).toBe("hoja.pdf");
    expect(primerArchivo([])).toBeNull();
    expect(bytesDeDataUrl("data:image/jpeg;base64,aaaa")).toBe(3);
  });
});
