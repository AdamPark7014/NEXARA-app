"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import { toast } from "@/components/Toast";
import { formatApiError } from "@/lib/erp-api";
import { AGREEMENT_KIND_LABEL, addAgreement, proponerActa, updateMeeting, type AgreementKind } from "@/lib/meetings-api";
import {
  cuerposParaGuardar,
  editables,
  faltaResponsable,
  limpiarTranscripcion,
  type AcuerdoEditable,
  type ActaPropuesta,
} from "@/lib/acta-ia";
import s from "./reuniones.module.css";

/**
 * «Acta con IA» dentro del detalle de una reunión: se pega (o se sube) la transcripción,
 * Claude propone minuta y acuerdos, y se guarda solo lo que se deja marcado.
 */
export default function ActaIA({
  token,
  meetingId,
  personas,
  onGuardada,
}: {
  token: string;
  meetingId: number;
  personas: Array<{ id: number; nombre: string }>;
  onGuardada: () => Promise<void> | void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acta, setActa] = useState<ActaPropuesta | null>(null);
  const [minuta, setMinuta] = useState("");
  const [acuerdos, setAcuerdos] = useState<AcuerdoEditable[]>([]);

  if (!abierto) {
    return (
      <div>
        <Button size="sm" variant="secondary" onClick={() => setAbierto(true)}>
          Generar acta con IA
        </Button>
      </div>
    );
  }

  const leerArchivo = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("El archivo es muy grande. Sube la transcripción en texto (.txt, .vtt o .srt).");
      return;
    }
    setTexto(limpiarTranscripcion(await file.text()));
  };

  const generar = async () => {
    setGenerando(true);
    setError(null);
    try {
      const r = await proponerActa(token, meetingId, texto);
      setActa(r);
      setMinuta(r.minuta);
      setAcuerdos(editables(r));
    } catch (e) {
      setError(formatApiError(e, "La IA no respondió. Intenta de nuevo."));
    } finally {
      setGenerando(false);
    }
  };

  const cambiar = (i: number, cambio: Partial<AcuerdoEditable>) =>
    setAcuerdos((prev) => prev.map((a, j) => (j === i ? { ...a, ...cambio } : a)));

  const guardar = async () => {
    setGuardando(true);
    try {
      if (minuta.trim()) await updateMeeting(token, meetingId, { notas: minuta.trim() });
      const cuerpos = cuerposParaGuardar(acuerdos);
      for (const cuerpo of cuerpos) await addAgreement(token, meetingId, cuerpo);
      toast.success(`Acta guardada${cuerpos.length ? ` con ${cuerpos.length} registro${cuerpos.length === 1 ? "" : "s"}` : ""}`);
      setActa(null);
      setTexto("");
      setAbierto(false);
      await onGuardada();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo guardar el acta."));
    } finally {
      setGuardando(false);
    }
  };

  const sinResponsable = acuerdos.filter(faltaResponsable).length;

  return (
    <div className={s.divider}>
      <span className={s.fieldLabel} style={{ marginBottom: 0 }}>Acta con IA</span>

      {!acta ? (
        <>
          <textarea
            className={s.input}
            rows={6}
            aria-label="Transcripción o notas de la reunión"
            placeholder="Pega aquí la transcripción de la grabación o tus notas de la reunión"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <input
            type="file"
            accept=".txt,.vtt,.srt,text/plain"
            aria-label="Subir transcripción"
            onChange={(e) => void leerArchivo(e.target.files?.[0])}
          />
          <p className={s.hint} style={{ margin: 0 }}>
            Claude escribe el resumen, los temas, las decisiones y los acuerdos con responsable. Nada se guarda hasta que lo revises.
          </p>
          {error ? <InlineAlert variant="danger" message={error} /> : null}
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" variant="primary" onClick={() => void generar()} loading={generando} disabled={texto.trim().length < 40}>
              {generando ? "Escribiendo el acta…" : "Generar acta"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setAbierto(false)} disabled={generando}>
              Cancelar
            </Button>
          </div>
        </>
      ) : (
        <>
          <label>
            <span className={s.fieldLabel}>Minuta (puedes corregirla)</span>
            <textarea className={s.input} rows={10} value={minuta} onChange={(e) => setMinuta(e.target.value)} />
          </label>

          <span className={s.fieldLabel} style={{ marginBottom: 0 }}>
            Acuerdos, lecciones y riesgos · {acuerdos.filter((a) => a.incluir).length} de {acuerdos.length}
          </span>
          {acuerdos.length === 0 ? <p className={s.hint}>La IA no encontró compromisos en el texto.</p> : null}
          {acuerdos.map((a, i) => {
            const propuesta = acta.acuerdos[i];
            const opciones = propuesta.responsableCandidatos.length && !a.responsableId ? propuesta.responsableCandidatos : personas;
            return (
              <div key={i} style={{ display: "grid", gap: 6, opacity: a.incluir ? 1 : 0.55 }}>
                <div className={s.rowKind}>
                  <select
                    className={s.input}
                    aria-label="Tipo"
                    value={a.tipo}
                    onChange={(e) => cambiar(i, { tipo: e.target.value as AgreementKind })}
                  >
                    {(Object.keys(AGREEMENT_KIND_LABEL) as AgreementKind[]).map((k) => (
                      <option key={k} value={k}>{AGREEMENT_KIND_LABEL[k]}</option>
                    ))}
                  </select>
                  <input
                    className={s.input}
                    aria-label="Descripción"
                    value={a.descripcion}
                    onChange={(e) => cambiar(i, { descripcion: e.target.value })}
                  />
                </div>
                {a.tipo === "ACUERDO" ? (
                  <div className={s.rowOwner}>
                    <select
                      className={s.input}
                      aria-label="Responsable"
                      aria-invalid={faltaResponsable(a) || undefined}
                      value={a.responsableId}
                      onChange={(e) => cambiar(i, { responsableId: e.target.value })}
                    >
                      <option value="">
                        {propuesta.textoResponsable ? `Responsable… (dijeron «${propuesta.textoResponsable}»)` : "Responsable…"}
                      </option>
                      {opciones.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </select>
                    <input
                      className={s.input}
                      type="date"
                      aria-label="Fecha compromiso"
                      value={a.fechaCompromiso}
                      onChange={(e) => cambiar(i, { fechaCompromiso: e.target.value })}
                    />
                  </div>
                ) : null}
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={a.incluir} onChange={(e) => cambiar(i, { incluir: e.target.checked })} />
                  Guardar este registro
                </label>
              </div>
            );
          })}

          {sinResponsable ? (
            <p className={s.hint} style={{ margin: 0 }}>
              {sinResponsable === 1 ? "Un acuerdo no tiene" : `${sinResponsable} acuerdos no tienen`} responsable: elige uno o desmárcalo para guardar lo demás.
            </p>
          ) : null}
          {acta.uso?.usdAprox != null ? (
            <p className={s.hint} style={{ margin: 0 }}>
              Costo de esta acta: ~US${acta.uso.usdAprox.toFixed(3)} ({acta.uso.tokensEntrada + acta.uso.tokensSalida} tokens)
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" variant="primary" onClick={() => void guardar()} loading={guardando} disabled={sinResponsable > 0}>
              Guardar acta
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setActa(null)} disabled={guardando}>
              Volver a generar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
