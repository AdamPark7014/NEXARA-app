"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mensajeMicrofono, useGrabadora, type MetaParte } from "@/lib/use-grabadora";
import { duracionLegible } from "@/lib/voz-api";
import { abrirDispositivo, dispositivoDePista, listarMicrofonos, recordarMicrofono, type Dispositivo } from "@/lib/microfono";
import {
  concluirGrabacion,
  estadoGrabacion,
  juntarNotas,
  subirParte,
  type GrabacionExistente,
  type NotasGuardadas,
} from "@/lib/grabacion-api";
import { useDictado } from "@/lib/use-dictado";
import { guardarVistaPrevia, juntarTextos, ultimaContigua, vistaPreviaGuardada, type Frase, type TextoParte } from "@/lib/transcripcion-vivo";
import { abrirCanal, borrarNota, guardarNota, tituloConGrabacion, tituloSinGrabacion, type MensajeGrabacion } from "./grabacion-activa";

/**
 * Partes de 20 s: el texto bueno (whisper) llega pronto a la pantalla y, si algo falla, se pierde
 * a lo mucho eso. Medido en el servidor (23-10, banco con FLEURS en español, limpio y «de sala»):
 * con 20 s y contexto de 22 s, large-v3-turbo trabaja a ~0.8–1.0× tiempo real con el servidor
 * ocupado; 30 s no mejoró el WER del modelo grande y al pequeño le hacía perder frases.
 */
const PARTE_MS = 20_000;
/** Tres horas de junta como máximo; aviso 10 minutos antes. */
const MAX_MS = 3 * 60 * 60_000;
export const AVISO_MS = MAX_MS - 10 * 60_000;
const CONSULTA_MS = 6_000;
/** Cinco segundos de silencio digital (ni una muestra distinta de cero): micrófono mudo. */
export const SILENCIO_MS = 5_000;

type Pendiente = { parte: number; meta: MetaParte; audio: Blob };

export type SesionGrabacion = {
  meetingId: number;
  titulo: string;
  /** Micrófono abierto en el mismo toque del botón. */
  stream?: MediaStream | null;
  /** Al retomar: lo ya grabado y la última parte subida. */
  baseMs?: number;
  baseParte?: number;
};

/**
 * La junta en curso, sin pantalla: graba, sube cada parte (con reintento si se cae la red), trae
 * las notas y el texto, y concluye. Vive en el layout de `/erp`, no en la página de Reuniones: por
 * eso sigue grabando aunque cambies de módulo, de pestaña o de aplicación, hasta que la concluyas.
 */
export function useMotorGrabacion({
  token,
  sesion,
  onConcluida,
  onDescartar,
}: {
  token: string;
  sesion: SesionGrabacion;
  /** La minuta se está escribiendo (o ya está). */
  onConcluida: (meetingId: number) => void;
  /** Se detuvo sin concluir (lo subido queda guardado). */
  onDescartar: () => void;
}) {
  const { meetingId, titulo } = sesion;
  const [estado, setEstado] = useState<GrabacionExistente | null>(null);
  const [notas, setNotas] = useState<NotasGuardadas[]>([]);
  const [enCola, setEnCola] = useState(0);
  const [sinRed, setSinRed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [concluyendo, setConcluyendo] = useState(false);
  const cola = useRef<Pendiente[]>([]);
  const trabajando = useRef(false);
  const despertar = useRef<() => void>(() => undefined);
  const notasRef = useRef<NotasGuardadas[]>([]);
  notasRef.current = notas;
  const [textos, setTextos] = useState<TextoParte[]>([]);
  const textosRef = useRef<TextoParte[]>([]);
  textosRef.current = textos;
  const baseTexto = sesion.baseParte ?? 0;

  /** Sube las partes en orden; si falla la red, reintenta sola (3 s, 6 s… hasta 30 s). */
  const procesarCola = useCallback(async () => {
    if (trabajando.current) return;
    trabajando.current = true;
    let espera = 3_000;
    while (cola.current.length) {
      const p = cola.current[0];
      try {
        await subirParte(token, meetingId, p.parte, p.meta, p.audio);
        cola.current.shift();
        setEnCola(cola.current.length);
        setSinRed(false);
        espera = 3_000;
      } catch (e) {
        const status = (e as { status?: number }).status ?? 0;
        if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
          // El servidor rechazó la parte (p. ej. ya concluyó): no tiene caso reintentar.
          cola.current.shift();
          setEnCola(cola.current.length);
          setError(e instanceof Error ? e.message : "El servidor rechazó una parte de la grabación.");
          continue;
        }
        setSinRed(true);
        await new Promise<void>((resolve) => {
          const t = window.setTimeout(resolve, espera);
          despertar.current = () => {
            window.clearTimeout(t);
            resolve();
          };
        });
        espera = Math.min(espera * 2, 30_000);
      }
    }
    trabajando.current = false;
  }, [token, meetingId]);

  useEffect(() => {
    const alVolver = () => despertar.current();
    window.addEventListener("online", alVolver);
    return () => window.removeEventListener("online", alVolver);
  }, []);

  const encolar = useCallback(
    (audio: Blob, parte: number, meta: MetaParte) => {
      cola.current.push({ parte, meta, audio });
      setEnCola(cola.current.length);
      void procesarCola();
    },
    [procesarCola],
  );

  const concluir = useCallback(async () => {
    setConcluyendo(true);
    setError(null);
    grabadora.detener();
    // La última parte sale al detener (MediaRecorder la entrega en unos milisegundos).
    await new Promise((r) => window.setTimeout(r, 1_200));
    while (cola.current.length || trabajando.current) {
      despertar.current();
      await new Promise((r) => window.setTimeout(r, 500));
    }
    try {
      await concluirGrabacion(token, meetingId);
      borrarNota();
      onConcluida(meetingId);
    } catch (e) {
      setConcluyendo(false);
      setError(e instanceof Error ? e.message : "No se pudo concluir la reunión. Intenta de nuevo.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, meetingId, onConcluida]);

  const concluirRef = useRef(concluir);
  concluirRef.current = concluir;

  const grabadora = useGrabadora({
    parteMs: PARTE_MS,
    maxMs: MAX_MS,
    onParte: encolar,
    onLimite: () => void concluirRef.current(),
  });

  // Arranca en cuanto se monta, con el micrófono que ya se pidió en el toque del botón.
  const arrancada = useRef(false);
  useEffect(() => {
    if (arrancada.current || !grabadora.soportado) return;
    arrancada.current = true;
    void grabadora.iniciar({ stream: sesion.stream, baseMs: sesion.baseMs, baseParte: sesion.baseParte });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grabadora.soportado]);

  // Estado y notas nuevas cada 6 s mientras se graba.
  useEffect(() => {
    let vivo = true;
    const consultar = async () => {
      try {
        const r = await estadoGrabacion(token, meetingId, notasRef.current.length, ultimaContigua(textosRef.current, baseTexto));
        if (!vivo || !r.existe) return;
        setEstado(r);
        if (r.notas.length) setNotas((prev) => juntarNotas(prev, r.notas, r.notasDesde));
        if (r.textos?.length) setTextos((prev) => juntarTextos(prev, r.textos!));
      } catch {
        /* sin red: la siguiente consulta lo intenta */
      }
    };
    void consultar();
    const t = window.setInterval(() => void consultar(), CONSULTA_MS);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, meetingId]);

  // Vista previa con el reconocimiento de voz del navegador (Chrome, Edge, Safari): instantánea,
  // aproximada; el texto de whisper la sustituye conforme llega.
  const [vistaPrevia, setVistaPrevia] = useState(true);
  useEffect(() => setVistaPrevia(vistaPreviaGuardada()), []);
  const [frases, setFrases] = useState<Frase[]>([]);
  const transcurridoRef = useRef(0);
  transcurridoRef.current = grabadora.transcurrido;
  const dictado = useDictado((texto) => setFrases((prev) => [...prev.slice(-120), { ms: transcurridoRef.current, texto }]));
  const escuchar = vistaPrevia && dictado.soportado && grabadora.grabando && !grabadora.pausado && !concluyendo;
  const micActual = grabadora.microfono?.deviceId ?? null;
  const micPrevio = useRef<string | null>(null);
  useEffect(() => {
    if (escuchar && dictado.escuchando && micPrevio.current !== micActual) dictado.detener(); // otro micrófono: se reinicia con él
    micPrevio.current = micActual;
    if (escuchar && !dictado.escuchando && !dictado.error) dictado.iniciar(grabadora.pista());
    if (!escuchar && dictado.escuchando) dictado.detener();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escuchar, dictado.escuchando, dictado.error, micActual]);

  // Mientras se graba o falta subir algo, cerrar la pestaña pide confirmación.
  const ocupado = grabadora.grabando || enCola > 0 || concluyendo;
  useEffect(() => {
    if (!ocupado) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [ocupado]);

  // Micrófonos disponibles (con nombre: el permiso ya se dio) y cambio a mitad de la junta.
  const [microfonos, setMicrofonos] = useState<Dispositivo[]>([]);
  const [cambiandoMic, setCambiandoMic] = useState(false);
  useEffect(() => {
    if (!grabadora.grabando) return;
    const cargar = () => void listarMicrofonos().then(setMicrofonos).catch(() => undefined);
    cargar();
    navigator.mediaDevices?.addEventListener?.("devicechange", cargar);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", cargar);
  }, [grabadora.grabando]);

  const cambiarMicrofono = async (deviceId: string) => {
    if (!deviceId || deviceId === grabadora.microfono?.deviceId) return;
    setCambiandoMic(true);
    setError(null);
    try {
      const nuevo = await abrirDispositivo(deviceId);
      grabadora.cambiarMicrofono(nuevo);
      const pista = nuevo.getAudioTracks()[0];
      const real = dispositivoDePista(pista?.label ?? "", pista?.getSettings?.().deviceId, microfonos);
      if (real) recordarMicrofono(real.deviceId);
    } catch (e) {
      setError(mensajeMicrofono(e));
    } finally {
      setCambiandoMic(false);
    }
  };

  const descartar = () => {
    if (!window.confirm("¿Detener la grabación sin concluir? Lo grabado se queda guardado y puedes concluirla después desde la reunión.")) return;
    grabadora.detener();
    borrarNota();
    onDescartar();
  };

  const cambiarVistaPrevia = (activa: boolean) => {
    setVistaPrevia(activa);
    guardarVistaPrevia(activa);
  };

  const reloj = duracionLegible(grabadora.transcurrido);
  const pausado = grabadora.pausado;

  // Al pasar a otra pestaña, su título sigue diciendo que se está grabando.
  useEffect(() => {
    if (!grabadora.grabando) return;
    document.title = tituloConGrabacion(document.title, reloj, pausado);
  }, [grabadora.grabando, reloj, pausado]);
  useEffect(
    () => () => {
      document.title = tituloSinGrabacion(document.title);
    },
    [],
  );

  // La nota para retomar si la página se recarga o se cierra por accidente.
  const cincoSegundos = Math.floor(grabadora.transcurrido / 5_000);
  useEffect(() => {
    if (grabadora.grabando) guardarNota({ meetingId, titulo, at: Date.now() });
  }, [grabadora.grabando, cincoSegundos, meetingId, titulo]);

  // Las demás pestañas de Core ven la grabación y la controlan desde su barra.
  const canal = useRef<BroadcastChannel | null>(null);
  const acciones = useRef({ pausar: grabadora.pausar, reanudar: grabadora.reanudar });
  acciones.current = { pausar: grabadora.pausar, reanudar: grabadora.reanudar };
  useEffect(() => {
    const c = abrirCanal();
    canal.current = c;
    if (!c) return;
    c.onmessage = (e: MessageEvent<MensajeGrabacion>) => {
      if (e.data?.tipo !== "orden") return;
      if (e.data.orden === "pausar") acciones.current.pausar();
      if (e.data.orden === "reanudar") acciones.current.reanudar();
      if (e.data.orden === "concluir") void concluirRef.current();
    };
    return () => {
      c.postMessage({ tipo: "fin", meetingId } satisfies MensajeGrabacion);
      c.close();
      canal.current = null;
    };
  }, [meetingId]);
  const segundo = Math.floor(grabadora.transcurrido / 1_000);
  useEffect(() => {
    if (!grabadora.grabando) return;
    canal.current?.postMessage({ tipo: "estado", meetingId, titulo, ms: grabadora.transcurrido, pausado, concluyendo } satisfies MensajeGrabacion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segundo, grabadora.grabando, pausado, concluyendo, meetingId, titulo]);

  return {
    sesion,
    estado,
    notas,
    enCola,
    sinRed,
    error,
    concluyendo,
    textos,
    baseTexto,
    grabadora,
    frases,
    dictado,
    vistaPrevia,
    cambiarVistaPrevia,
    escuchar,
    microfonos,
    cambiandoMic,
    cambiarMicrofono,
    concluir,
    descartar,
  };
}

export type MotorGrabacion = ReturnType<typeof useMotorGrabacion>;
