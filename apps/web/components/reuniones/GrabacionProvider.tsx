"use client";

import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { concluirGrabacion, estadoGrabacion } from "@/lib/grabacion-api";
import { abrirMicrofono } from "@/lib/use-grabadora";
import BarraGrabacion, { ControlesGrabacion } from "./BarraGrabacion";
import {
  OTRA_PESTANA_CADUCA_MS,
  abrirCanal,
  apiFlotante,
  borrarNota,
  copiarEstilos,
  esReciente,
  leerNota,
  type MensajeGrabacion,
  type NotaGrabacion,
} from "./grabacion-activa";
import { useMotorGrabacion, type MotorGrabacion, type SesionGrabacion } from "./useMotorGrabacion";

export type { MotorGrabacion, SesionGrabacion } from "./useMotorGrabacion";

/** La grabación en otra pestaña de Core: se ve y se controla desde aquí. */
export type OtraPestana = Extract<MensajeGrabacion, { tipo: "estado" }>;

type Sesion = {
  sesion: SesionGrabacion | null;
  /** Empieza a grabar (el motor vive en el layout, no en la página). */
  comenzar: (s: SesionGrabacion) => void;
  /** Se está grabando en otra pestaña: aquí no se puede empezar otra. */
  otraPestana: OtraPestana | null;
  ordenar: (orden: "pausar" | "reanudar" | "concluir") => void;
  /** Se cortó sin concluir (recarga, cierre): se ofrece retomarla. */
  interrumpida: NotaGrabacion | null;
  retomar: (nota: NotaGrabacion) => Promise<void>;
  concluirInterrumpida: (nota: NotaGrabacion) => Promise<void>;
  olvidarInterrumpida: () => void;
  /** Reunión recién concluida: la pantalla la abre, o la barra lleva a ella. */
  concluida: number | null;
  limpiarConcluida: () => void;
  /** Detenida sin concluir: la lista de Reuniones se refresca. */
  descartadas: number;
  flotanteDisponible: boolean;
  flotanteAbierta: boolean;
  abrirFlotante: () => Promise<void>;
};

const SesionCtx = createContext<Sesion | null>(null);
const MotorCtx = createContext<MotorGrabacion | null>(null);

/** Quién puede empezar, retomar y qué pasa al concluir. No cambia con cada tic del reloj. */
export function useGrabacionActiva(): Sesion {
  const c = useContext(SesionCtx);
  if (!c) throw new Error("useGrabacionActiva necesita GrabacionProvider");
  return c;
}

/** El motor con todo su estado (cambia 4 veces por segundo: solo para la barra y el panel). */
export function useMotor(): MotorGrabacion | null {
  return useContext(MotorCtx);
}

/** Sin pantalla; `memo` para que informar su estado no lo vuelva a pintar en cadena. */
const Motor = memo(function Motor({
  token,
  sesion,
  onCambio,
  onConcluida,
  onDescartar,
}: {
  token: string;
  sesion: SesionGrabacion;
  onCambio: (m: MotorGrabacion | null) => void;
  onConcluida: (id: number) => void;
  onDescartar: () => void;
}) {
  const motor = useMotorGrabacion({ token, sesion, onConcluida, onDescartar });
  useEffect(() => onCambio(motor));
  useEffect(() => () => onCambio(null), [onCambio]);
  return null;
});

/**
 * La grabación de reuniones a nivel del layout de `/erp`: sigue grabando aunque cambies de módulo,
 * de pestaña o de aplicación, hasta que la concluyas. Si la página se recarga, se retoma sola; si
 * pasó más tiempo, la barra ofrece retomarla.
 */
export default function GrabacionProvider({ children }: { children: ReactNode }) {
  const { token } = useUser();
  const [sesion, setSesion] = useState<SesionGrabacion | null>(null);
  const [motor, setMotor] = useState<MotorGrabacion | null>(null);
  const [concluida, setConcluida] = useState<number | null>(null);
  const [descartadas, setDescartadas] = useState(0);
  const [interrumpida, setInterrumpida] = useState<NotaGrabacion | null>(null);
  const [otraPestana, setOtraPestana] = useState<OtraPestana | null>(null);
  const [flotante, setFlotante] = useState<Window | null>(null);
  const [flotanteDisponible, setFlotanteDisponible] = useState(false);
  const sesionRef = useRef(sesion);
  sesionRef.current = sesion;
  const otraRef = useRef(otraPestana);
  otraRef.current = otraPestana;

  useEffect(() => setFlotanteDisponible(Boolean(apiFlotante())), []);

  const comenzar = useCallback((s: SesionGrabacion) => {
    setInterrumpida(null);
    setConcluida(null);
    setSesion(s);
  }, []);
  const alConcluir = useCallback((id: number) => {
    setSesion(null);
    setConcluida(id);
  }, []);
  const alDescartar = useCallback(() => {
    setSesion(null);
    setDescartadas((n) => n + 1);
  }, []);
  const limpiarConcluida = useCallback(() => setConcluida(null), []);
  const olvidarInterrumpida = useCallback(() => {
    borrarNota();
    setInterrumpida(null);
  }, []);

  // Las otras pestañas: la que graba avisa cada segundo; si deja de hacerlo, ya no graba.
  const canal = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const c = abrirCanal();
    canal.current = c;
    if (!c) return;
    let caduca = 0;
    c.onmessage = (e: MessageEvent<MensajeGrabacion>) => {
      if (e.data?.tipo === "estado") {
        setInterrumpida(null);
        setOtraPestana(e.data);
        window.clearTimeout(caduca);
        caduca = window.setTimeout(() => setOtraPestana(null), OTRA_PESTANA_CADUCA_MS);
      }
      if (e.data?.tipo === "fin") setOtraPestana(null);
    };
    return () => {
      window.clearTimeout(caduca);
      c.close();
      canal.current = null;
    };
  }, []);
  const ordenar = useCallback((orden: "pausar" | "reanudar" | "concluir") => {
    canal.current?.postMessage({ tipo: "orden", orden } satisfies MensajeGrabacion);
  }, []);

  const retomar = useCallback(
    async (nota: NotaGrabacion) => {
      if (!token) return;
      try {
        const r = await estadoGrabacion(token, nota.meetingId);
        // Ya se concluyó (desde otra sesión o dispositivo): no hay nada que retomar.
        if (!r.existe || r.estado !== "GRABANDO") {
          borrarNota();
          setInterrumpida(null);
          return;
        }
        const { stream, error } = await abrirMicrofono();
        if (!stream) {
          setInterrumpida(nota);
          toast.error(error ?? "No se pudo abrir el micrófono.");
          return;
        }
        comenzar({ meetingId: nota.meetingId, titulo: nota.titulo, stream, baseMs: r.duracionMs, baseParte: r.ultima });
      } catch {
        setInterrumpida(nota);
      }
    },
    [token, comenzar],
  );

  const concluirInterrumpida = useCallback(
    async (nota: NotaGrabacion) => {
      if (!token) return;
      try {
        await concluirGrabacion(token, nota.meetingId);
        borrarNota();
        setInterrumpida(null);
        setConcluida(nota.meetingId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo concluir la reunión.");
      }
    },
    [token],
  );

  // Al entrar: ¿quedó una grabación sin concluir? Se espera un momento por si otra pestaña la lleva.
  const revisada = useRef(false);
  useEffect(() => {
    if (!token || revisada.current) return;
    revisada.current = true;
    const nota = leerNota();
    if (!nota) return;
    const t = window.setTimeout(() => {
      if (sesionRef.current || otraRef.current) return;
      if (esReciente(nota)) void retomar(nota);
      else setInterrumpida(nota);
    }, 1_500);
    return () => window.clearTimeout(t);
  }, [token, retomar]);

  // La ventanita siempre encima: con un botón, o sola al pasar a otra pestaña donde Chrome lo permite.
  const abrirFlotante = useCallback(async () => {
    const api = apiFlotante();
    if (!api || flotanteRef.current) return;
    try {
      const w = await api.requestWindow({ width: 320, height: 118 });
      copiarEstilos(w.document);
      w.addEventListener("pagehide", () => setFlotante(null));
      setFlotante(w);
    } catch {
      /* sin gesto del usuario, o el navegador no quiso: sigue la barra */
    }
  }, []);
  const flotanteRef = useRef(flotante);
  flotanteRef.current = flotante;
  useEffect(() => {
    if (!sesion) return;
    const sesionMedios = navigator.mediaSession as (MediaSession & { setActionHandler: (a: string, h: (() => void) | null) => void }) | undefined;
    try {
      sesionMedios?.setActionHandler("enterpictureinpicture", () => void abrirFlotante());
    } catch {
      /* este navegador no la abre solo */
    }
    return () => {
      try {
        sesionMedios?.setActionHandler("enterpictureinpicture", null);
      } catch {
        /* nada que quitar */
      }
    };
  }, [sesion, abrirFlotante]);
  useEffect(() => {
    if (!sesion && flotanteRef.current) flotanteRef.current.close();
  }, [sesion]);

  const valor = useMemo<Sesion>(
    () => ({
      sesion,
      comenzar,
      otraPestana,
      ordenar,
      interrumpida,
      retomar,
      concluirInterrumpida,
      olvidarInterrumpida,
      concluida,
      limpiarConcluida,
      descartadas,
      flotanteDisponible,
      flotanteAbierta: Boolean(flotante),
      abrirFlotante,
    }),
    [sesion, comenzar, otraPestana, ordenar, interrumpida, retomar, concluirInterrumpida, olvidarInterrumpida, concluida, limpiarConcluida, descartadas, flotanteDisponible, flotante, abrirFlotante],
  );

  return (
    <SesionCtx.Provider value={valor}>
      <MotorCtx.Provider value={motor}>
        {children}
        {sesion && token ? <Motor key={sesion.meetingId} token={token} sesion={sesion} onCambio={setMotor} onConcluida={alConcluir} onDescartar={alDescartar} /> : null}
        <BarraGrabacion />
        {flotante && motor ? createPortal(<ControlesGrabacion motor={motor} flotante />, flotante.document.body) : null}
      </MotorCtx.Provider>
    </SesionCtx.Provider>
  );
}
