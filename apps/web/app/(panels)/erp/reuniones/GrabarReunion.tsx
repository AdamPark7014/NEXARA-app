"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import { useGrabadora, type MetaParte } from "@/lib/use-grabadora";
import { duracionLegible } from "@/lib/voz-api";
import {
  concluirGrabacion,
  estadoGrabacion,
  juntarNotas,
  subirParte,
  type GrabacionExistente,
  type NotasGuardadas,
} from "@/lib/grabacion-api";
import NotasEnVivo from "./NotasEnVivo";
import s from "./reuniones.module.css";

/** Un minuto por parte: si algo falla, se pierde a lo mucho eso. */
const PARTE_MS = 60_000;
/** Tres horas de junta como máximo; aviso 10 minutos antes. */
const MAX_MS = 3 * 60 * 60_000;
const AVISO_MS = MAX_MS - 10 * 60_000;
const CONSULTA_MS = 10_000;

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
 * La junta en curso: «Grabando · 12:34», pausa y «Concluir reunión». Cada minuto sube una parte
 * (con reintento si se cae la red; lo subido no se pierde aunque se cierre la pestaña) y las
 * notas que la IA toma por tramos van apareciendo. Al concluir, el servidor escribe la minuta.
 */
export default function GrabarReunion({
  token,
  sesion,
  onConcluida,
  onDescartar,
}: {
  token: string;
  sesion: SesionGrabacion;
  /** La minuta se está escribiendo (o ya está): se abre la reunión. */
  onConcluida: (meetingId: number) => void;
  /** Se detuvo sin concluir (lo subido queda guardado). */
  onDescartar: () => void;
}) {
  const { meetingId } = sesion;
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

  // Estado y notas nuevas cada 10 s mientras se graba.
  useEffect(() => {
    let vivo = true;
    const consultar = async () => {
      try {
        const r = await estadoGrabacion(token, meetingId, notasRef.current.length);
        if (!vivo || !r.existe) return;
        setEstado(r);
        if (r.notas.length) setNotas((prev) => juntarNotas(prev, r.notas, r.notasDesde));
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
  }, [token, meetingId]);

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

  const descartar = () => {
    if (!window.confirm("¿Detener la grabación sin concluir? Lo grabado se queda guardado y puedes concluirla después desde la reunión.")) return;
    grabadora.detener();
    onDescartar();
  };

  if (!grabadora.soportado) {
    return <InlineAlert variant="warning" message="Este navegador no puede grabar audio. Usa Chrome, Edge o Safari actualizados." />;
  }

  const minutos = Math.floor(grabadora.transcurrido / 60_000);
  const enTexto = estado?.listas ?? 0;
  const etiqueta = concluyendo ? "Concluyendo" : grabadora.pausado ? "En pausa" : grabadora.grabando ? "Grabando" : "Detenida";

  return (
    <section className={s.rec} aria-label="Grabación de la reunión en curso">
      <div className={s.recHead}>
        <div className={s.recStatus}>
          <span
            className={`${s.recDot} ${grabadora.grabando && !grabadora.pausado && !concluyendo ? s.recDotLive : ""}`}
            aria-hidden="true"
          />
          <div style={{ minWidth: 0 }}>
            <p className={s.recLabel} aria-live="polite">
              {etiqueta} · <span className={s.recClock}>{duracionLegible(grabadora.transcurrido)}</span>
            </p>
            <p className={s.recTitle}>{sesion.titulo}</p>
          </div>
        </div>
        <div className={s.recActions}>
          {grabadora.grabando && !concluyendo ? (
            grabadora.pausado ? (
              <Button variant="secondary" onClick={grabadora.reanudar}>Reanudar</Button>
            ) : (
              <Button variant="secondary" onClick={grabadora.pausar}>Pausar</Button>
            )
          ) : null}
          <Button variant="danger" size="lg" onClick={() => void concluir()} loading={concluyendo} disabled={concluyendo}>
            Concluir reunión
          </Button>
        </div>
      </div>

      <p className={s.recMeta}>
        {concluyendo
          ? enCola
            ? `Subiendo lo último de la grabación (${enCola} ${enCola === 1 ? "parte" : "partes"})…`
            : "Guardando la grabación para escribir la minuta…"
          : `${minutos} ${minutos === 1 ? "minuto grabado" : "minutos grabados"} · ${enTexto} ya en texto · las notas se toman cada ~4 minutos`}
        {!concluyendo && enCola > 1 ? ` · ${enCola} partes por subir` : ""}
      </p>

      {sinRed ? (
        <InlineAlert
          variant="warning"
          message={`Sin conexión con el servidor: ${enCola} ${enCola === 1 ? "parte espera" : "partes esperan"} y se suben solas al volver la red. No cierres esta pestaña.`}
        />
      ) : null}
      {grabadora.transcurrido >= AVISO_MS && !concluyendo ? (
        <InlineAlert variant="warning" message="Faltan menos de 10 minutos para el máximo de 3 horas: al llegar, la reunión se concluye sola." />
      ) : null}
      {error || grabadora.error ? <InlineAlert variant="danger" message={(grabadora.error ?? error) as string} /> : null}

      <NotasEnVivo notas={notas} grabando={grabadora.grabando && !concluyendo} />

      {!concluyendo ? (
        <div className={s.recFoot}>
          <p className={s.hint} style={{ margin: 0 }}>
            Deja esta pantalla abierta cerca de quien habla. La voz se pasa a texto en nuestro servidor y el audio se borra en cuanto se transcribe.
          </p>
          <Button size="sm" variant="ghost" onClick={descartar}>
            Detener sin concluir
          </Button>
        </div>
      ) : null}
    </section>
  );
}
