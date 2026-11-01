"use client";

/**
 * Graba audio del micrófono con MediaRecorder y lo entrega en partes completas.
 *
 * Cada `parteMs` se cierra el archivo y se abre otro sobre el mismo micrófono: así cada
 * parte se puede transcribir sola y una junta de horas no queda en un solo archivo que se
 * pierda si se cierra la pestaña. El audio va en opus a 48 kbps (~360 KB por minuto).
 *
 * Pausar cierra la parte en curso (se entrega) y no abre otra hasta reanudar: el tiempo en
 * pausa no cuenta. Cada parte llega con su posición en la grabación (`inicioMs`) y su duración.
 *
 * El micrófono se elige midiendo la señal (`lib/microfono.ts`): un cable virtual mudo ya no
 * graba una junta en silencio. Mientras se graba hay medidor de nivel y cuenta de silencio, y se
 * puede cambiar de micrófono a mitad sin perder nada.
 *
 * Pensado para no parar en segundo plano: el reloj va en un worker (el navegador frena los timers
 * de una pestaña oculta), el bloqueo de pantalla se vuelve a pedir al regresar y, si el micrófono
 * se desconecta, se vuelve a abrir solo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { elegirFormatoAudio } from "@/lib/voz-api";
import { elegirMicrofonoNavegador, type Dispositivo } from "@/lib/microfono";

export type MetaParte = { inicioMs: number; duracionMs: number };

type Opciones = {
  /** Duración de cada parte. Por omisión, una sola parte. */
  parteMs?: number;
  /** Se detiene sola al llegar aquí (tiempo grabado, sin pausas). */
  maxMs?: number;
  onParte: (audio: Blob, parte: number, meta: MetaParte) => void;
  /** Se llegó a `maxMs`. */
  onLimite?: () => void;
};

type Inicio = {
  /** Micrófono ya abierto (se pidió en el mismo toque del botón). */
  stream?: MediaStream | null;
  /** Al retomar una grabación: tiempo ya grabado y última parte subida. */
  baseMs?: number;
  baseParte?: number;
};

const MENSAJES: Record<string, string> = {
  NotAllowedError: "El navegador no tiene permiso para usar el micrófono.",
  SecurityError: "El navegador no tiene permiso para usar el micrófono.",
  NotFoundError: "No se encontró un micrófono.",
  NotReadableError: "Otro programa está usando el micrófono.",
  OverconstrainedError: "Ese micrófono ya no está conectado.",
};

export const mensajeMicrofono = (e: unknown) => MENSAJES[(e as DOMException)?.name] ?? "No se pudo abrir el micrófono.";

/**
 * Pide el micrófono y se queda con el primero que de verdad suene (ver `lib/microfono.ts`).
 * `sinSenal`: ninguno dio señal; se graba con el mejor y la pantalla avisa.
 */
export async function abrirMicrofono(): Promise<{
  stream: MediaStream | null;
  error: string | null;
  dispositivo: Dispositivo | null;
  sinSenal: boolean;
}> {
  try {
    const r = await elegirMicrofonoNavegador();
    return { stream: r.stream, error: null, dispositivo: r.dispositivo, sinSenal: r.sinSenal };
  } catch (e) {
    return { stream: null, error: mensajeMicrofono(e), dispositivo: null, sinSenal: false };
  }
}

type WakeLock = { release: () => Promise<void> };

/** Un tic cada `ms`, en un worker si se puede; si no, con un timer normal. Devuelve cómo pararlo. */
function crearReloj(ms: number, tic: () => void): () => void {
  let parar: () => void = () => undefined;
  const conTimer = () => {
    const t = window.setInterval(tic, ms);
    parar = () => window.clearInterval(t);
  };
  try {
    if (typeof Worker === "undefined") conTimer();
    else {
      const w = new Worker("/grabacion-reloj.js");
      w.onmessage = () => tic();
      w.onerror = () => {
        w.terminate();
        conTimer();
      };
      w.postMessage(ms);
      parar = () => w.terminate();
    }
  } catch {
    conTimer();
  }
  return () => parar();
}

type Medidor = { ctx: AudioContext; fuente: MediaStreamAudioSourceNode; analizador: AnalyserNode; datos: Float32Array<ArrayBuffer> };

export function useGrabadora({ parteMs, maxMs, onParte, onLimite }: Opciones) {
  const [soportado, setSoportado] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [transcurrido, setTranscurrido] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** Pico del audio en el último medio segundo (0–1); null si no se puede medir. */
  const [nivel, setNivel] = useState<number | null>(null);
  /** Tiempo grabando sin una sola muestra distinta de cero (micrófono mudo). */
  const [silencioMs, setSilencioMs] = useState(0);
  /** Micrófono en uso: nombre y `deviceId` de la pista. */
  const [microfono, setMicrofono] = useState<{ label: string; deviceId: string | null } | null>(null);
  /** Analizador del micrófono en uso (para la onda en vivo). */
  const [analizador, setAnalizador] = useState<AnalyserNode | null>(null);
  /** El micrófono se desconectó a mitad de la grabación y se está volviendo a abrir. */
  const [micCaido, setMicCaido] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const grabadora = useRef<MediaRecorder | null>(null);
  const timers = useRef<number[]>([]);
  const pararReloj = useRef<(() => void) | null>(null);
  const ultimaParte = useRef(0);
  const recuperar = useRef<() => void>(() => undefined);
  const numero = useRef(0);
  const activo = useRef(false);
  const pausa = useRef(false);
  /** Tiempo grabado antes del tramo en curso y cuándo empezó ese tramo. */
  const acumulado = useRef(0);
  const desde = useRef(0);
  const pantalla = useRef<WakeLock | null>(null);
  const medidor = useRef<Medidor | null>(null);
  const ultimoSonido = useRef(0);
  const callback = useRef(onParte);
  callback.current = onParte;
  const limite = useRef(onLimite);
  limite.current = onLimite;

  useEffect(() => {
    setSoportado(
      typeof window !== "undefined" &&
        typeof window.MediaRecorder !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia),
    );
  }, []);

  const grabadoMs = useCallback(
    () => acumulado.current + (activo.current && !pausa.current ? Date.now() - desde.current : 0),
    [],
  );

  const desconectarMedidor = useCallback(() => {
    const m = medidor.current;
    medidor.current = null;
    setAnalizador(null);
    if (!m) return;
    try {
      m.fuente.disconnect();
    } catch {
      /* ya desconectado */
    }
    void m.ctx.close().catch(() => undefined);
  }, []);

  /** Medidor de nivel sobre el micrófono en uso. Sin AudioContext, la grabación sigue sin medidor. */
  const conectarMedidor = useCallback(
    (s: MediaStream) => {
      desconectarMedidor();
      ultimoSonido.current = Date.now();
      setSilencioMs(0);
      const pista = s.getAudioTracks()[0];
      setMicrofono(pista ? { label: pista.label, deviceId: pista.getSettings?.().deviceId ?? null } : null);
      // Se desconectó (audífonos, USB, otra app se lo llevó): no se corta la junta por eso.
      if (pista) {
        pista.onended = () => {
          if (activo.current && stream.current === s) recuperar.current();
        };
      }
      try {
        const ctx = new AudioContext();
        void ctx.resume().catch(() => undefined);
        const fuente = ctx.createMediaStreamSource(s);
        const analizador = ctx.createAnalyser();
        analizador.fftSize = 2048;
        fuente.connect(analizador);
        medidor.current = { ctx, fuente, analizador, datos: new Float32Array(new ArrayBuffer(analizador.fftSize * 4)) };
        setAnalizador(analizador);
      } catch {
        medidor.current = null;
        setNivel(null);
      }
    },
    [desconectarMedidor],
  );

  /** Lectura del medidor (cada 250 ms mientras se graba). */
  const leerNivel = useCallback(() => {
    const m = medidor.current;
    const pista = stream.current?.getAudioTracks()[0];
    if (!m || m.ctx.state !== "running") {
      if (m) void m.ctx.resume().catch(() => undefined);
      setNivel(null);
      return;
    }
    m.analizador.getFloatTimeDomainData(m.datos);
    let pico = 0;
    for (let i = 0; i < m.datos.length; i++) pico = Math.max(pico, Math.abs(m.datos[i]));
    if (pista?.muted || pista?.enabled === false) pico = 0;
    setNivel(pico);
    if (pausa.current) {
      ultimoSonido.current = Date.now();
      setSilencioMs(0);
    } else {
      if (pico > 0) ultimoSonido.current = Date.now();
      setSilencioMs(Date.now() - ultimoSonido.current);
    }
  }, []);

  const soltarMicrofono = useCallback(() => {
    desconectarMedidor();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void pantalla.current?.release().catch(() => undefined);
    pantalla.current = null;
    setNivel(null);
    setSilencioMs(0);
  }, [desconectarMedidor]);

  const abrirParte = useCallback(() => {
    if (!stream.current) return;
    const formato = elegirFormatoAudio((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream.current, {
      ...(formato ? { mimeType: formato } : {}),
      // 48 kbps: opus a 32 ya se oía bien de cerca; de lejos, con ruido, conviene más detalle (~360 KB/min).
      audioBitsPerSecond: 48_000,
    });
    const parte = ++numero.current;
    const inicioMs = grabadoMs();
    const trozos: Blob[] = [];
    ultimaParte.current = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) trozos.push(e.data);
    };
    rec.onstop = () => {
      const audio = new Blob(trozos, { type: rec.mimeType || formato || "audio/webm" });
      const duracionMs = Math.max(0, grabadoMs() - inicioMs);
      if (audio.size) callback.current(audio, parte, { inicioMs, duracionMs });
      if (!activo.current && grabadora.current === rec) soltarMicrofono();
    };
    rec.start(1_000);
    grabadora.current = rec;
  }, [grabadoMs, soltarMicrofono]);

  const cerrarParte = useCallback(() => {
    const rec = grabadora.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const detener = useCallback(() => {
    if (!activo.current) return;
    acumulado.current = grabadoMs();
    activo.current = false;
    pausa.current = false;
    timers.current.forEach((t) => window.clearInterval(t));
    timers.current = [];
    pararReloj.current?.();
    pararReloj.current = null;
    setGrabando(false);
    setPausado(false);
    setMicCaido(false);
    const rec = grabadora.current;
    if (rec && rec.state !== "inactive") rec.stop();
    else soltarMicrofono();
  }, [grabadoMs, soltarMicrofono]);

  const pausar = useCallback(() => {
    if (!activo.current || pausa.current) return;
    acumulado.current = grabadoMs();
    pausa.current = true;
    setPausado(true);
    cerrarParte();
  }, [cerrarParte, grabadoMs]);

  const reanudar = useCallback(() => {
    if (!activo.current || !pausa.current) return;
    pausa.current = false;
    desde.current = Date.now();
    ultimoSonido.current = Date.now();
    setPausado(false);
    abrirParte();
  }, [abrirParte]);

  /**
   * Cambia de micrófono a mitad de la junta: la parte en curso se cierra (se entrega) y la
   * siguiente arranca con el nuevo. El micrófono anterior se suelta cuando terminó de entregar.
   */
  const cambiarMicrofono = useCallback(
    (nuevo: MediaStream) => {
      if (!activo.current) {
        nuevo.getTracks().forEach((t) => t.stop());
        return;
      }
      const anterior = grabadora.current;
      const viejo = stream.current;
      stream.current = nuevo;
      conectarMedidor(nuevo);
      if (!pausa.current) abrirParte(); // la nueva arranca antes de cerrar la anterior
      if (anterior && anterior.state !== "inactive") anterior.stop();
      window.setTimeout(() => viejo?.getTracks().forEach((t) => t.stop()), 1_500);
    },
    [abrirParte, conectarMedidor],
  );

  // Reabre el micrófono hasta lograrlo; mientras, la pantalla avisa y lo grabado ya está a salvo.
  recuperar.current = () => {
    setMicCaido(true);
    void (async () => {
      while (activo.current) {
        const r = await abrirMicrofono();
        if (!activo.current) {
          r.stream?.getTracks().forEach((t) => t.stop());
          return;
        }
        if (r.stream) {
          cambiarMicrofono(r.stream);
          setMicCaido(false);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 5_000));
      }
    })();
  };

  // El navegador suelta el bloqueo de pantalla al ocultar la pestaña: se vuelve a pedir al regresar.
  useEffect(() => {
    if (!grabando) return;
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } }).wakeLock;
      if (!wl) return;
      void wl
        .request("screen")
        .then((nuevo) => {
          pantalla.current = nuevo;
        })
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [grabando]);

  const iniciar = useCallback(
    async (inicio: Inicio = {}) => {
      if (activo.current) return;
      setError(null);
      if (inicio.stream) {
        stream.current = inicio.stream;
      } else {
        const r = await abrirMicrofono();
        if (!r.stream) {
          setError(r.error);
          return;
        }
        stream.current = r.stream;
      }
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } }).wakeLock;
        if (wl) pantalla.current = await wl.request("screen");
      } catch {
        /* sin bloqueo de pantalla: se graba igual */
      }
      activo.current = true;
      pausa.current = false;
      numero.current = inicio.baseParte ?? 0;
      acumulado.current = inicio.baseMs ?? 0;
      desde.current = Date.now();
      setTranscurrido(acumulado.current);
      setGrabando(true);
      setPausado(false);
      conectarMedidor(stream.current);
      try {
        abrirParte();
      } catch {
        activo.current = false;
        setGrabando(false);
        soltarMicrofono();
        setError("Este navegador no puede grabar audio.");
        return;
      }
      pararReloj.current = crearReloj(500, () => {
        if (!activo.current) return;
        const ms = grabadoMs();
        setTranscurrido(ms);
        if (maxMs && ms >= maxMs) {
          detener();
          limite.current?.();
          return;
        }
        if (!parteMs || pausa.current || Date.now() - ultimaParte.current < parteMs) return;
        // Con el micrófono caído no hay qué partir: `recuperar` abre la siguiente.
        if (!stream.current?.getAudioTracks().some((t) => t.readyState === "live")) return;
        const anterior = grabadora.current;
        abrirParte(); // la nueva arranca antes de cerrar la anterior: no se pierde nada
        if (anterior && anterior.state !== "inactive") anterior.stop();
      });
      timers.current.push(window.setInterval(leerNivel, 250));
    },
    [abrirParte, conectarMedidor, detener, grabadoMs, leerNivel, maxMs, parteMs, soltarMicrofono],
  );

  useEffect(
    () => () => {
      activo.current = false;
      timers.current.forEach((t) => window.clearInterval(t));
      pararReloj.current?.();
      if (grabadora.current && grabadora.current.state !== "inactive") grabadora.current.stop();
      soltarMicrofono();
    },
    [soltarMicrofono],
  );

  /** Pista del micrófono en uso (para el reconocimiento de voz del navegador). */
  const pista = useCallback(() => stream.current?.getAudioTracks()[0] ?? null, []);

  return {
    soportado,
    analizador,
    pista,
    grabando,
    pausado,
    transcurrido,
    error,
    nivel,
    silencioMs,
    microfono,
    micCaido,
    iniciar,
    detener,
    pausar,
    reanudar,
    cambiarMicrofono,
  };
}
