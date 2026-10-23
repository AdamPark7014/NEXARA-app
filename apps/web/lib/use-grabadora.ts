"use client";

/**
 * Graba audio del micrófono con MediaRecorder y lo entrega en partes completas.
 *
 * Cada `parteMs` se cierra el archivo y se abre otro sobre el mismo micrófono: así cada
 * parte se puede transcribir sola y una junta de horas no queda en un solo archivo que se
 * pierda si se cierra la pestaña. El audio va en opus a 32 kbps (~240 KB por minuto).
 *
 * Pausar cierra la parte en curso (se entrega) y no abre otra hasta reanudar: el tiempo en
 * pausa no cuenta. Cada parte llega con su posición en la grabación (`inicioMs`) y su duración.
 *
 * El micrófono se elige midiendo la señal (`lib/microfono.ts`): un cable virtual mudo ya no
 * graba una junta en silencio. Mientras se graba hay medidor de nivel y cuenta de silencio, y se
 * puede cambiar de micrófono a mitad sin perder nada.
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
  const stream = useRef<MediaStream | null>(null);
  const grabadora = useRef<MediaRecorder | null>(null);
  const timers = useRef<number[]>([]);
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
      try {
        const ctx = new AudioContext();
        void ctx.resume().catch(() => undefined);
        const fuente = ctx.createMediaStreamSource(s);
        const analizador = ctx.createAnalyser();
        analizador.fftSize = 2048;
        fuente.connect(analizador);
        medidor.current = { ctx, fuente, analizador, datos: new Float32Array(analizador.fftSize) };
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
      audioBitsPerSecond: 32_000,
    });
    const parte = ++numero.current;
    const inicioMs = grabadoMs();
    const trozos: Blob[] = [];
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
    setGrabando(false);
    setPausado(false);
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
      timers.current.push(
        window.setInterval(() => {
          const ms = grabadoMs();
          setTranscurrido(ms);
          if (maxMs && ms >= maxMs) {
            detener();
            limite.current?.();
          }
        }, 500),
      );
      timers.current.push(window.setInterval(leerNivel, 250));
      if (parteMs) {
        timers.current.push(
          window.setInterval(() => {
            if (!activo.current || pausa.current) return;
            const anterior = grabadora.current;
            abrirParte(); // la nueva arranca antes de cerrar la anterior: no se pierde nada
            if (anterior && anterior.state !== "inactive") anterior.stop();
          }, parteMs),
        );
      }
    },
    [abrirParte, conectarMedidor, detener, grabadoMs, leerNivel, maxMs, parteMs, soltarMicrofono],
  );

  useEffect(
    () => () => {
      activo.current = false;
      timers.current.forEach((t) => window.clearInterval(t));
      if (grabadora.current && grabadora.current.state !== "inactive") grabadora.current.stop();
      soltarMicrofono();
    },
    [soltarMicrofono],
  );

  return {
    soportado,
    grabando,
    pausado,
    transcurrido,
    error,
    nivel,
    silencioMs,
    microfono,
    iniciar,
    detener,
    pausar,
    reanudar,
    cambiarMicrofono,
  };
}
