"use client";

/**
 * Dictado «como FinanVoz» para dar instrucciones cortas (Adam, 23-10-2026: «que sea mucho más
 * intuitivo… así se tarda mucho, hay que interpretar, etc.»).
 *
 * Un toque al micrófono y el texto aparece en vivo mientras se habla (reconocimiento de voz del
 * navegador, es-MX, con resultados intermedios). Se detiene solo tras ~1.8 s de silencio con algo
 * dicho, o con otro toque, y entonces entrega el texto completo UNA vez (`alTerminar`): quien lo
 * usa interpreta en ese momento, nunca con el texto intermedio.
 *
 * El nivel del micrófono (`analizador`) es solo para la onda; si no se puede abrir, el dictado
 * sigue igual sin onda. Navegadores sin reconocimiento (Firefox): `soportado` = false y la página
 * usa el transcriptor del servidor como respaldo.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type ResultadoVoz = { isFinal: boolean; 0: { transcript: string } };
type EventoVoz = { resultIndex: number; results: ArrayLike<ResultadoVoz> };
type Reconocedor = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoVoz) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type ConstructorReconocedor = new () => Reconocedor;

export type EstadoDictado = "inactivo" | "escuchando" | "terminando";

/** Silencio, con algo ya dicho, tras el que se da por terminado. */
export const SILENCIO_MS = 1_800;
/** Si en este tiempo no se oyó nada, se detiene sin interpretar. */
export const SIN_VOZ_MS = 8_000;
/** Un dictado es una instrucción: a los 90 s se corta solo. */
export const MAXIMO_MS = 90_000;

export function reconocedorDelNavegador(): ConstructorReconocedor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: ConstructorReconocedor;
    webkitSpeechRecognition?: ConstructorReconocedor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Lo dicho hasta ahora: frases ya cerradas y lo que se está oyendo. */
export function textoDeResultados(resultados: ArrayLike<ResultadoVoz>): { finales: string; parcial: string } {
  const finales: string[] = [];
  const parcial: string[] = [];
  for (let i = 0; i < resultados.length; i++) {
    const r = resultados[i];
    const t = (r?.[0]?.transcript ?? "").trim();
    if (!t) continue;
    (r.isFinal ? finales : parcial).push(t);
  }
  return { finales: finales.join(" "), parcial: parcial.join(" ") };
}

export const MENSAJES_DICTADO: Record<string, string> = {
  "not-allowed": "El navegador no tiene permiso para usar el micrófono. Permítelo en el candado junto a la dirección y vuelve a tocar el micrófono.",
  "service-not-allowed": "El navegador no deja usar el reconocimiento de voz. Escribe la instrucción o prueba con Chrome o Edge.",
  "audio-capture": "No se encontró un micrófono. Conecta uno o escribe la instrucción.",
  network: "Se perdió la conexión del dictado. Vuelve a tocar el micrófono.",
  "sin-voz": "No te escuché. Toca el micrófono y habla cerca de él.",
};

export function useDictadoVivo({
  alTerminar,
  silencioMs = SILENCIO_MS,
}: {
  /** Texto completo al terminar (solo si se dijo algo). Una vez por dictado. */
  alTerminar: (texto: string) => void;
  silencioMs?: number;
}) {
  const [soportado, setSoportado] = useState(false);
  const [estado, setEstado] = useState<EstadoDictado>("inactivo");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [analizador, setAnalizador] = useState<AnalyserNode | null>(null);

  const reconocedor = useRef<Reconocedor | null>(null);
  const dicho = useRef({ finales: "", parcial: "" });
  const temporizadores = useRef<{ silencio?: number; sinVoz?: number; maximo?: number }>({});
  const microfono = useRef<{ stream: MediaStream; contexto: AudioContext } | null>(null);
  const entregado = useRef(false);
  const callback = useRef(alTerminar);
  callback.current = alTerminar;

  const limpiarTiempos = () => {
    const t = temporizadores.current;
    window.clearTimeout(t.silencio);
    window.clearTimeout(t.sinVoz);
    window.clearTimeout(t.maximo);
    temporizadores.current = {};
  };

  const soltarMicrofono = useCallback(() => {
    const m = microfono.current;
    microfono.current = null;
    setAnalizador(null);
    if (!m) return;
    m.stream.getTracks().forEach((t) => t.stop());
    void m.contexto.close().catch(() => undefined);
  }, []);

  /** Pide al reconocedor que cierre: llega el último resultado y luego `onend` entrega. */
  const detener = useCallback(() => {
    limpiarTiempos();
    if (!reconocedor.current) return;
    setEstado("terminando");
    try {
      reconocedor.current.stop();
    } catch {
      /* ya estaba detenido: `onend` no llegará, se entrega aquí */
      reconocedor.current.onend?.();
    }
  }, []);

  useEffect(() => {
    setSoportado(Boolean(reconocedorDelNavegador()));
    return () => {
      limpiarTiempos();
      entregado.current = true;
      try {
        reconocedor.current?.abort();
      } catch {
        /* nada */
      }
      reconocedor.current = null;
      const m = microfono.current;
      microfono.current = null;
      m?.stream.getTracks().forEach((t) => t.stop());
      void m?.contexto.close().catch(() => undefined);
    };
  }, []);

  /** La onda: el nivel real del micrófono. Si falla, el dictado sigue sin onda. */
  const abrirNivel = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!reconocedor.current) {
        // Se terminó (o falló) mientras se abría: no dejar el micrófono prendido.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const contexto = new Ctx();
      const nodo = contexto.createAnalyser();
      nodo.fftSize = 2048;
      contexto.createMediaStreamSource(stream).connect(nodo);
      microfono.current = { stream, contexto };
      setAnalizador(nodo);
    } catch {
      /* sin onda */
    }
  }, []);

  const iniciar = useCallback(() => {
    const Ctor = reconocedorDelNavegador();
    if (!Ctor || reconocedor.current) return;
    setError(null);
    setTexto("");
    dicho.current = { finales: "", parcial: "" };
    entregado.current = false;
    const r = new Ctor();
    r.lang = "es-MX";
    r.continuous = true;
    r.interimResults = true;

    const programarSilencio = () => {
      window.clearTimeout(temporizadores.current.silencio);
      temporizadores.current.silencio = window.setTimeout(detener, silencioMs);
    };

    r.onresult = (e) => {
      dicho.current = textoDeResultados(e.results);
      const { finales, parcial } = dicho.current;
      setTexto([finales, parcial].filter(Boolean).join(" "));
      if (finales || parcial) {
        window.clearTimeout(temporizadores.current.sinVoz);
        programarSilencio();
      }
    };
    r.onerror = (e) => {
      if (e.error === "aborted") return;
      if (e.error === "no-speech") {
        setError(MENSAJES_DICTADO["sin-voz"]);
        return;
      }
      setError(MENSAJES_DICTADO[e.error] ?? "El dictado se detuvo. Vuelve a tocar el micrófono o escribe la instrucción.");
    };
    r.onend = () => {
      limpiarTiempos();
      reconocedor.current = null;
      soltarMicrofono();
      setEstado("inactivo");
      if (entregado.current) return;
      entregado.current = true;
      const { finales, parcial } = dicho.current;
      const completo = [finales, parcial].filter(Boolean).join(" ").trim();
      setTexto(completo);
      if (completo) callback.current(completo);
    };

    reconocedor.current = r;
    try {
      r.start();
    } catch {
      reconocedor.current = null;
      setError("No se pudo iniciar el dictado. Vuelve a tocar el micrófono o escribe la instrucción.");
      return;
    }
    setEstado("escuchando");
    temporizadores.current.sinVoz = window.setTimeout(() => {
      if (!dicho.current.finales && !dicho.current.parcial) {
        entregado.current = true;
        setError(MENSAJES_DICTADO["sin-voz"]);
        detener();
      }
    }, SIN_VOZ_MS);
    temporizadores.current.maximo = window.setTimeout(detener, MAXIMO_MS);
    void abrirNivel();
  }, [abrirNivel, detener, silencioMs, soltarMicrofono]);

  /** Cancela sin entregar nada (p. ej. «Limpiar» a medio dictado). */
  const cancelar = useCallback(() => {
    entregado.current = true;
    limpiarTiempos();
    try {
      reconocedor.current?.abort();
    } catch {
      /* nada */
    }
  }, []);

  return { soportado, estado, texto, error, analizador, iniciar, detener, cancelar };
}
