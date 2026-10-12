import { describe, expect, it } from "vitest";
import { duracionLegible, elegirFormatoAudio, extensionDe } from "./voz-api";

describe("voz propia", () => {
  it("elige opus en webm si el navegador lo graba", () => {
    expect(elegirFormatoAudio(() => true)).toBe("audio/webm;codecs=opus");
  });

  it("en Safari cae a mp4 y sin soporte usa el formato por omisión", () => {
    expect(elegirFormatoAudio((m) => m === "audio/mp4")).toBe("audio/mp4");
    expect(elegirFormatoAudio(() => false)).toBe("");
    expect(
      elegirFormatoAudio(() => {
        throw new Error("sin MediaRecorder");
      }),
    ).toBe("");
  });

  it("nombra el archivo según el formato", () => {
    expect(extensionDe("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionDe("audio/ogg;codecs=opus")).toBe("ogg");
    expect(extensionDe("audio/mp4")).toBe("m4a");
    expect(extensionDe("")).toBe("webm");
  });

  it("muestra la duración como reloj", () => {
    expect(duracionLegible(0)).toBe("0:00");
    expect(duracionLegible(754_000)).toBe("12:34");
    expect(duracionLegible(3_723_000)).toBe("1:02:03");
  });
});
