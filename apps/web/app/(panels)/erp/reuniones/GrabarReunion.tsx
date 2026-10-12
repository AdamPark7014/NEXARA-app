"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import { useGrabadora } from "@/lib/use-grabadora";
import {
  borrarGrabacion,
  duracionLegible,
  estadoGrabacion,
  subirParteGrabacion,
  vozPropiaDisponible,
  type EstadoGrabacion,
} from "@/lib/voz-api";
import s from "./reuniones.module.css";

/** Cada parte dura 5 minutos: si algo falla, se pierde a lo mucho eso. */
const PARTE_MS = 5 * 60_000;
const CONSULTA_MS = 8_000;

type Pendiente = { parte: number; audio: Blob };

/**
 * «Grabar reunión»: el navegador graba la junta y sube una parte cada 5 minutos; nuestro
 * transcriptor la pasa a texto en el servidor mientras la junta sigue. Al terminar, el
 * texto completo se entrega con `onTranscripcion` para generar el acta.
 */
export default function GrabarReunion({
  token,
  meetingId,
  autoIniciar = false,
  onTranscripcion,
}: {
  token: string;
  meetingId: number;
  /** Arranca a grabar en cuanto el transcriptor responde («Empezar reunión ahora»). */
  autoIniciar?: boolean;
  onTranscripcion: (texto: string) => void;
}) {
  const [disponible, setDisponible] = useState(false);
  const [estado, setEstado] = useState<EstadoGrabacion | null>(null);
  const [enviando, setEnviando] = useState(0);
  const [sinEnviar, setSinEnviar] = useState<Pendiente[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [entregada, setEntregada] = useState(false);
  const cola = useRef<Promise<void>>(Promise.resolve());
  const callback = useRef(onTranscripcion);
  callback.current = onTranscripcion;

  const refrescar = useCallback(async () => {
    try {
      setEstado(await estadoGrabacion(token, meetingId));
    } catch {
      /* se reintenta en la siguiente consulta */
    }
  }, [token, meetingId]);

  useEffect(() => {
    let vivo = true;
    vozPropiaDisponible(token).then((ok) => {
      if (!vivo || !ok) return;
      setDisponible(true);
      void refrescar();
    });
    return () => {
      vivo = false;
    };
  }, [token, refrescar]);

  /** Sube una parte; las partes van en fila para no saturar la conexión del celular. */
  const enviar = useCallback(
    (p: Pendiente) => {
      setEnviando((n) => n + 1);
      cola.current = cola.current.then(async () => {
        for (let intento = 1; intento <= 3; intento++) {
          try {
            setEstado(await subirParteGrabacion(token, meetingId, p.parte, p.audio));
            setSinEnviar((l) => l.filter((x) => x.parte !== p.parte));
            setEnviando((n) => n - 1);
            return;
          } catch (e) {
            if (intento === 3) {
              setSinEnviar((l) => [...l.filter((x) => x.parte !== p.parte), p]);
              setError(e instanceof Error ? e.message : "No se pudo enviar una parte de la grabación.");
              setEnviando((n) => n - 1);
              return;
            }
            await new Promise((r) => setTimeout(r, intento * 3_000));
          }
        }
      });
    },
    [token, meetingId],
  );

  const base = useRef(0);
  const grabadora = useGrabadora({
    parteMs: PARTE_MS,
    // Si ya había partes (se recargó la página), la numeración sigue después de ellas.
    onParte: (audio, n) => enviar({ parte: (base.current || 0) + n, audio }),
  });

  // Mientras se graba o falta subir algo, cerrar la pestaña pide confirmación.
  const ocupado = grabadora.grabando || enviando > 0 || sinEnviar.length > 0;
  useEffect(() => {
    if (!ocupado) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [ocupado]);

  // Al terminar de grabar, se consulta hasta que todas las partes estén transcritas.
  const esperando = !grabadora.grabando && Boolean(estado && estado.total > 0 && !estado.terminada);
  useEffect(() => {
    if (!esperando && !grabadora.grabando) return;
    const t = window.setInterval(() => void refrescar(), CONSULTA_MS);
    return () => window.clearInterval(t);
  }, [esperando, grabadora.grabando, refrescar]);

  // Transcripción completa y ya nada por subir: pasa sola al acta (una vez por grabación).
  useEffect(() => {
    if (entregada || grabadora.grabando || enviando > 0) return;
    if (estado?.terminada && estado.texto.trim()) {
      setEntregada(true);
      callback.current(estado.texto);
    }
  }, [estado, entregada, grabadora.grabando, enviando]);

  const iniciar = async () => {
    setError(null);
    setEntregada(false);
    base.current = estado?.partes.length ? Math.max(...estado.partes.map((p) => p.parte)) : 0;
    await grabadora.iniciar();
  };

  // Una sola vez por montaje: si la persona la detiene, no vuelve a arrancar sola.
  const autoArrancada = useRef(false);
  useEffect(() => {
    if (!autoIniciar || autoArrancada.current || !disponible || !grabadora.soportado || grabadora.grabando) return;
    autoArrancada.current = true;
    void iniciar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoIniciar, disponible, grabadora.soportado]);

  if (!disponible || !grabadora.soportado) return null;

  const borrar = async () => {
    if (!window.confirm("¿Borrar el audio y la transcripción de esta reunión? El acta guardada no se toca.")) return;
    try {
      await borrarGrabacion(token, meetingId);
      setSinEnviar([]);
      setEntregada(false);
      await refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar la grabación.");
    }
  };

  const total = estado?.total ?? 0;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {grabadora.grabando ? (
          <>
            <Button size="sm" variant="danger" onClick={grabadora.detener}>
              Detener grabación
            </Button>
            <span className={s.hint} style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 4 }} aria-live="polite">
              <FiberManualRecordIcon fontSize="inherit" style={{ color: "var(--danger)" }} aria-hidden />
              Grabando {duracionLegible(grabadora.transcurrido)}
              {total ? ` · ${estado?.listas ?? 0} de ${total} partes ya en texto` : ""}
            </span>
          </>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => void iniciar()}>
            {total ? "Seguir grabando" : "Grabar reunión"}
          </Button>
        )}
        {!grabadora.grabando && total > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => void borrar()} disabled={enviando > 0}>
            Borrar grabación
          </Button>
        ) : null}
      </div>

      {!grabadora.grabando && total === 0 ? (
        <p className={s.hint} style={{ margin: 0 }}>
          Deja esta pantalla abierta cerca de quien habla. La voz se pasa a texto en nuestro servidor, sin servicios externos.
        </p>
      ) : null}
      {enviando > 0 ? <p className={s.hint} style={{ margin: 0 }}>Enviando audio… ({enviando})</p> : null}
      {esperando ? (
        <p className={s.hint} style={{ margin: 0 }} aria-live="polite">
          Pasando a texto: {estado?.listas ?? 0} de {total} partes. Puedes seguir en otra cosa; aquí aparecerá.
        </p>
      ) : null}
      {estado?.terminada && entregada ? (
        <p className={s.hint} style={{ margin: 0 }}>
          Transcripción lista ({duracionLegible(total * PARTE_MS)} aprox.). Ya está en el cuadro del acta.
        </p>
      ) : null}
      {estado?.terminada && !entregada && estado.texto.trim() && !grabadora.grabando ? (
        <div>
          <Button size="sm" variant="secondary" onClick={() => { setEntregada(true); onTranscripcion(estado.texto); }}>
            Usar la transcripción en el acta
          </Button>
        </div>
      ) : null}
      {estado && estado.conError > 0 ? (
        <InlineAlert
          variant="warning"
          message={`${estado.conError === 1 ? "Una parte no se pudo" : `${estado.conError} partes no se pudieron`} pasar a texto; el resto sí.`}
        />
      ) : null}
      {sinEnviar.length ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <InlineAlert variant="danger" message={error ?? "Hay audio sin enviar."} />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setError(null);
              sinEnviar.forEach(enviar);
            }}
          >
            Reintentar envío ({sinEnviar.length})
          </Button>
        </div>
      ) : error || grabadora.error ? (
        <InlineAlert variant="danger" message={(grabadora.error ?? error) as string} />
      ) : null}
    </div>
  );
}
