"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import DictadoBoton from "@/components/DictadoBoton";
import { formatApiError } from "@/lib/erp-api";
import { limpiarTranscripcion } from "@/lib/acta-ia";
import { unirDictado } from "@/lib/use-dictado";
import { estadoGrabacion, minutaDesdeTexto, type EstadoGrabacion } from "@/lib/grabacion-api";
import MinutaReunion from "./MinutaReunion";
import s from "./reuniones.module.css";

/**
 * Minuta con IA dentro del detalle de una reunión. Si se grabó, la minuta (o su avance); si no,
 * «Comenzar a grabar reunión» o pegar la transcripción o las notas, que siguen el mismo camino.
 */
export default function ActaIA({
  token,
  meetingId,
  personas,
  onGrabar,
  onGuardada,
}: {
  token: string;
  meetingId: number;
  personas: Array<{ id: number; nombre: string }>;
  /** Empieza (o retoma) la grabación de esta reunión en la página. */
  onGrabar: (base?: { baseMs: number; baseParte: number }) => void;
  onGuardada: () => Promise<void> | void;
}) {
  const [estado, setEstado] = useState<EstadoGrabacion | null>(null);
  const [pegando, setPegando] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setEstado(await estadoGrabacion(token, meetingId));
    } catch {
      setEstado({ disponible: false, existe: false });
    }
  }, [token, meetingId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const leerArchivo = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("El archivo es muy grande: usa un texto .txt, .vtt o .srt.");
      return;
    }
    setTexto(limpiarTranscripcion(await file.text()));
  };

  const generar = async () => {
    setEnviando(true);
    setError(null);
    try {
      setEstado(await minutaDesdeTexto(token, meetingId, texto));
      setPegando(false);
    } catch (e) {
      setError(formatApiError(e, "No se pudo enviar el texto."));
    } finally {
      setEnviando(false);
    }
  };

  if (!estado) return <div className={s.skeleton} aria-busy="true" aria-label="Cargando la grabación" />;

  if (estado.existe) {
    return (
      <MinutaReunion
        key={estado.estado}
        token={token}
        meetingId={meetingId}
        inicial={estado}
        personas={personas}
        onSeguirGrabando={(base) => onGrabar(base)}
        onCambio={async () => {
          await cargar();
          await onGuardada();
        }}
      />
    );
  }

  return (
    <div className={s.minuta}>
      <p className={s.minutaTitle}>Minuta con IA</p>
      {!pegando ? (
        <>
          <p className={s.hint} style={{ margin: 0 }}>Graba la junta o pega la transcripción.</p>
          <div className={s.minutaActions}>
            {estado.disponible ? (
              <Button variant="primary" iconLeft="●" onClick={() => onGrabar()}>
                Comenzar a grabar reunión
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setPegando(true)}>
              Pegar transcripción o notas
            </Button>
          </div>
        </>
      ) : (
        <>
          <textarea
            className={s.input}
            rows={7}
            aria-label="Transcripción o notas de la reunión"
            placeholder="Pega la transcripción, escribe o dicta tus notas"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <DictadoBoton onTexto={(frase) => setTexto((t) => unirDictado(t, frase))} disabled={enviando} />
            <input type="file" accept=".txt,.vtt,.srt,text/plain" aria-label="Subir transcripción" onChange={(e) => void leerArchivo(e.target.files?.[0])} />
          </div>
          {error ? <InlineAlert variant="danger" message={error} /> : null}
          <div className={s.minutaActions}>
            <Button variant="primary" onClick={() => void generar()} loading={enviando} disabled={texto.trim().split(/\s+/).length < 15}>
              Escribir la minuta
            </Button>
            <Button variant="secondary" onClick={() => setPegando(false)} disabled={enviando}>
              Cancelar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
