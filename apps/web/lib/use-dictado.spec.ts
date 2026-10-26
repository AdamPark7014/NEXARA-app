import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { unirDictado, useDictado } from "./use-dictado";

/** Las dos frases de main (`8752494e`), citadas para que no vuelvan. */
const CONEXION_VIEJA = "Se perdió la conexión del dictado. Vuelve a intentarlo.";
const DETUVO_VIEJA = "El dictado se detuvo. Vuelve a intentarlo.";

const CONEXION = "Se perdió la conexión del dictado: vuelve a intentarlo.";
const DETUVO = "El dictado se detuvo: vuelve a intentarlo.";

type Reconocedor = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** El navegador de la prueba no tiene micrófono: este reconocedor solo dispara el corte. */
class ReconocedorFalso implements Reconocedor {
  static ultimo: ReconocedorFalso | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start() {
    ReconocedorFalso.ultimo = this;
  }
  stop() {
    this.onend?.();
  }
}

function instalarReconocedor() {
  const w = window as unknown as {
    SpeechRecognition?: new () => Reconocedor;
    webkitSpeechRecognition?: new () => Reconocedor;
  };
  const previo = {
    SpeechRecognition: w.SpeechRecognition,
    webkitSpeechRecognition: w.webkitSpeechRecognition,
  };
  w.SpeechRecognition = ReconocedorFalso;
  w.webkitSpeechRecognition = undefined;
  return () => {
    w.SpeechRecognition = previo.SpeechRecognition;
    w.webkitSpeechRecognition = previo.webkitSpeechRecognition;
    ReconocedorFalso.ultimo = null;
  };
}

function cortar(codigo: string) {
  const r = ReconocedorFalso.ultimo;
  if (!r?.onerror || !r.onend) throw new Error("el dictado no arrancó");
  r.onerror({ error: codigo });
  r.onend();
}

function unaFrase(texto: string) {
  expect(texto.split(".").filter((parte) => parte.trim()).length).toBe(1);
}

describe("dictado por voz", () => {
  afterEach(() => {
    ReconocedorFalso.ultimo = null;
  });

  it("agrega cada frase con un espacio y sin duplicar espacios", () => {
    expect(unirDictado("", " que Antonio vaya a Tox ")).toBe("que Antonio vaya a Tox");
    expect(unirDictado("que Antonio vaya", "a las tres")).toBe("que Antonio vaya a las tres");
    expect(unirDictado("hola ", "mundo")).toBe("hola mundo");
    expect(unirDictado("hola", "   ")).toBe("hola");
  });

  it("si se corta, cada error es una frase y volver a dictar se queda", () => {
    const quitar = instalarReconocedor();
    try {
      const { result } = renderHook(() => useDictado(() => {}));

      act(() => {
        result.current.iniciar();
      });
      act(() => {
        cortar("network");
      });
      expect(result.current.error).toBe(CONEXION);
      expect(result.current.error).not.toBe(CONEXION_VIEJA);
      unaFrase(result.current.error ?? "");
      expect(result.current.error).toContain("vuelve a intentarlo");
      expect(result.current.escuchando).toBe(false);

      act(() => {
        result.current.iniciar();
      });
      expect(result.current.error).toBeNull();
      expect(result.current.escuchando).toBe(true);

      act(() => {
        cortar("language-not-supported");
      });
      expect(result.current.error).toBe(DETUVO);
      expect(result.current.error).not.toBe(DETUVO_VIEJA);
      unaFrase(result.current.error ?? "");
      expect(result.current.error).toContain("vuelve a intentarlo");
      expect(result.current.escuchando).toBe(false);

      act(() => {
        result.current.iniciar();
      });
      expect(result.current.error).toBeNull();
      expect(result.current.escuchando).toBe(true);
    } finally {
      quitar();
    }
  });
});
