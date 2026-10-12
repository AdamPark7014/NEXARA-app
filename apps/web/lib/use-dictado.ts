"use client";

/**
 * Dictado por voz con el reconocimiento del navegador (Web Speech API).
 *
 * No cuesta nada ni necesita claves: Chrome, Edge y Safari pasan la voz a texto ellos
 * mismos (Chrome usa los servidores de Google). Firefox no lo trae: ahí el botón no
 * aparece. Sirve para dictar instrucciones y notas; para grabar horas de junta conviene un
 * servicio de transcripción dedicado.
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
};
type ConstructorReconocedor = new () => Reconocedor;

function constructorDelNavegador(): ConstructorReconocedor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: ConstructorReconocedor;
    webkitSpeechRecognition?: ConstructorReconocedor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MENSAJE_ERROR: Record<string, string> = {
  "not-allowed": "El navegador no tiene permiso para usar el micrófono.",
  "service-not-allowed": "El navegador no tiene permiso para usar el micrófono.",
  "audio-capture": "No se encontró un micrófono.",
  network: "Se perdió la conexión del dictado. Vuelve a intentarlo.",
};

/** Une lo dictado al texto que ya había, con un espacio de por medio. */
export function unirDictado(actual: string, nuevo: string): string {
  const limpio = nuevo.trim();
  if (!limpio) return actual;
  if (!actual.trim()) return limpio;
  return /\s$/.test(actual) ? actual + limpio : `${actual} ${limpio}`;
}

/**
 * `alTerminarFrase` recibe cada frase ya reconocida; `parcial` es lo que se está oyendo.
 * El reconocimiento de Chrome se apaga solo tras un silencio: mientras la persona no
 * detenga el dictado, se vuelve a encender.
 */
export function useDictado(alTerminarFrase: (texto: string) => void) {
  const [soportado, setSoportado] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [parcial, setParcial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reconocedor = useRef<Reconocedor | null>(null);
  const quiereEscuchar = useRef(false);
  const callback = useRef(alTerminarFrase);
  callback.current = alTerminarFrase;

  useEffect(() => {
    setSoportado(Boolean(constructorDelNavegador()));
    return () => {
      quiereEscuchar.current = false;
      reconocedor.current?.stop();
    };
  }, []);

  const detener = useCallback(() => {
    quiereEscuchar.current = false;
    reconocedor.current?.stop();
    setEscuchando(false);
    setParcial("");
  }, []);

  const iniciar = useCallback(() => {
    const Ctor = constructorDelNavegador();
    if (!Ctor) return;
    setError(null);
    const r = new Ctor();
    r.lang = "es-MX";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let enCurso = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) callback.current(res[0].transcript);
        else enCurso += res[0].transcript;
      }
      setParcial(enCurso);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      quiereEscuchar.current = false;
      setError(MENSAJE_ERROR[e.error] ?? "El dictado se detuvo. Vuelve a intentarlo.");
    };
    r.onend = () => {
      if (quiereEscuchar.current) {
        try {
          r.start();
          return;
        } catch {
          /* cae a detener */
        }
      }
      setEscuchando(false);
      setParcial("");
    };
    reconocedor.current = r;
    quiereEscuchar.current = true;
    try {
      r.start();
      setEscuchando(true);
    } catch {
      quiereEscuchar.current = false;
      setError("No se pudo iniciar el dictado.");
    }
  }, []);

  return { soportado, escuchando, parcial, error, iniciar, detener };
}
