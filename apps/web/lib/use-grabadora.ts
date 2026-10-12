"use client";

/**
 * Graba audio del micrófono con MediaRecorder y lo entrega en partes completas.
 *
 * Cada `parteMs` se cierra el archivo y se abre otro sobre el mismo micrófono: así cada
 * parte se puede transcribir sola y una junta de horas no queda en un solo archivo que se
 * pierda si se cierra la pestaña. El audio va en opus a 32 kbps (~15 MB por hora).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { elegirFormatoAudio } from "@/lib/voz-api";

type Opciones = {
  /** Duración de cada parte. Por omisión, una sola parte. */
  parteMs?: number;
  /** Se detiene sola al llegar aquí. */
  maxMs?: number;
  onParte: (audio: Blob, parte: number) => void;
};

const MENSAJES: Record<string, string> = {
  NotAllowedError: "El navegador no tiene permiso para usar el micrófono.",
  SecurityError: "El navegador no tiene permiso para usar el micrófono.",
  NotFoundError: "No se encontró un micrófono.",
  NotReadableError: "Otro programa está usando el micrófono.",
};

type WakeLock = { release: () => Promise<void> };

export function useGrabadora({ parteMs, maxMs, onParte }: Opciones) {
  const [soportado, setSoportado] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [transcurrido, setTranscurrido] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const grabadora = useRef<MediaRecorder | null>(null);
  const timers = useRef<number[]>([]);
  const numero = useRef(0);
  const activo = useRef(false);
  const pantalla = useRef<WakeLock | null>(null);
  const callback = useRef(onParte);
  callback.current = onParte;

  useEffect(() => {
    setSoportado(
      typeof window !== "undefined" &&
        typeof window.MediaRecorder !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia),
    );
  }, []);

  const soltarMicrofono = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void pantalla.current?.release().catch(() => undefined);
    pantalla.current = null;
  }, []);

  const abrirParte = useCallback(() => {
    if (!stream.current) return;
    const formato = elegirFormatoAudio((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream.current, {
      ...(formato ? { mimeType: formato } : {}),
      audioBitsPerSecond: 32_000,
    });
    const parte = ++numero.current;
    const trozos: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) trozos.push(e.data);
    };
    rec.onstop = () => {
      const audio = new Blob(trozos, { type: rec.mimeType || formato || "audio/webm" });
      if (audio.size) callback.current(audio, parte);
      if (!activo.current && grabadora.current === rec) soltarMicrofono();
    };
    rec.start(1_000);
    grabadora.current = rec;
  }, [soltarMicrofono]);

  const detener = useCallback(() => {
    if (!activo.current) return;
    activo.current = false;
    timers.current.forEach((t) => window.clearInterval(t));
    timers.current = [];
    setGrabando(false);
    const rec = grabadora.current;
    if (rec && rec.state !== "inactive") rec.stop();
    else soltarMicrofono();
  }, [soltarMicrofono]);

  const iniciar = useCallback(async () => {
    if (activo.current) return;
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch (e) {
      setError(MENSAJES[(e as DOMException)?.name] ?? "No se pudo abrir el micrófono.");
      return;
    }
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } }).wakeLock;
      if (wl) pantalla.current = await wl.request("screen");
    } catch {
      /* sin bloqueo de pantalla: se graba igual */
    }
    activo.current = true;
    numero.current = 0;
    const inicio = Date.now();
    setTranscurrido(0);
    setGrabando(true);
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
        const ms = Date.now() - inicio;
        setTranscurrido(ms);
        if (maxMs && ms >= maxMs) detener();
      }, 500),
    );
    if (parteMs) {
      timers.current.push(
        window.setInterval(() => {
          if (!activo.current) return;
          const anterior = grabadora.current;
          abrirParte(); // la nueva arranca antes de cerrar la anterior: no se pierde nada
          if (anterior && anterior.state !== "inactive") anterior.stop();
        }, parteMs),
      );
    }
  }, [abrirParte, detener, maxMs, parteMs, soltarMicrofono]);

  useEffect(
    () => () => {
      activo.current = false;
      timers.current.forEach((t) => window.clearInterval(t));
      if (grabadora.current && grabadora.current.state !== "inactive") grabadora.current.stop();
      soltarMicrofono();
    },
    [soltarMicrofono],
  );

  return { soportado, grabando, transcurrido, error, iniciar, detener };
}
