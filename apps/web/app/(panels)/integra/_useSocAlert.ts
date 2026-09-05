"use client";

/**
 * Aviso sonoro de la cola SOC.
 *
 * Reglas que no se negocian:
 *   1. Apagado por defecto. Nunca suena nada que el operador no haya encendido.
 *   2. El interruptor se recuerda (localStorage) — encenderlo en cada turno es
 *      la forma más rápida de que nadie lo encienda.
 *   3. El `AudioContext` nace en el clic del interruptor, que es un gesto de
 *      usuario: así el navegador no lo bloquea ni deja un contexto suspendido
 *      colgando en cada pestaña del panel.
 *   4. Sin fichero de audio: dos tonos sintetizados. Un .mp3 en `public/` es un
 *      recurso más que mantener y otro que la CSP tiene que dejar pasar.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "nexara_integra_soc_alerta_sonora";

/** Silencio mínimo entre avisos: una ráfaga de 20 alarmas no son 20 pitidos. */
const MIN_GAP_MS = 4000;

type WindowWithLegacyAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function readStored(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function createContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as WindowWithLegacyAudio).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

export type SocAlert = {
  enabled: boolean;
  /** El navegador no da audio (sin WebAudio o bloqueado): se avisa, no se finge. */
  unsupported: boolean;
  toggle: () => void;
  /** Pita si está encendido. Devuelve si llegó a sonar. */
  alert: () => boolean;
};

export function useSocAlert(): SocAlert {
  const [enabled, setEnabled] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const lastAtRef = useRef(0);

  // El valor guardado se lee tras montar: en SSR no hay localStorage y leerlo
  // en el primer render pintaría un estado distinto en servidor y cliente.
  useEffect(() => {
    setEnabled(readStored());
  }, []);

  useEffect(() => {
    return () => {
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx) void ctx.close().catch(() => undefined);
    };
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* modo privado: el interruptor sigue valiendo para esta sesión */
      }
      if (next) {
        // Estamos dentro del clic: es el único momento en que el navegador
        // deja abrir/reanudar audio sin pelea.
        const ctx = ctxRef.current || createContext();
        ctxRef.current = ctx;
        if (!ctx) {
          setUnsupported(true);
          return next;
        }
        void ctx.resume().catch(() => undefined);
        // Confirmación audible de que el aviso quedó armado.
        beep(ctx, [660], 0.08, 0.05);
      }
      return next;
    });
  }, []);

  const alert = useCallback((): boolean => {
    if (!enabled) return false;
    const ctx = ctxRef.current;
    if (!ctx) return false;
    const now = Date.now();
    if (now - lastAtRef.current < MIN_GAP_MS) return false;
    lastAtRef.current = now;
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    beep(ctx, [880, 660], 0.16, 0.09);
    return true;
  }, [enabled]);

  return { enabled, unsupported, toggle, alert };
}

/** Dos tonos cortos con rampa: sin clic de arranque ni cola de zumbido. */
function beep(ctx: AudioContext, freqs: number[], stepSec: number, gainPeak: number): void {
  try {
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const start = t0 + i * stepSec;
      const end = start + stepSec;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(gainPeak, start + stepSec * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    });
  } catch {
    /* si el audio falla, la alarma sigue viéndose: no se rompe la cola */
  }
}
