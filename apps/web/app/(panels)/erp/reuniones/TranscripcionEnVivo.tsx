"use client";

import { useEffect, useRef } from "react";
import { colaDeTexto, cubiertoHasta, frasesPendientes, type Frase, type TextoParte } from "@/lib/transcripcion-vivo";
import s from "./reuniones.module.css";

/**
 * Lo que se va diciendo: el texto de whisper (el bueno, cada ~20 s) y, después, la vista previa
 * del navegador en gris mientras whisper la alcanza. Sin vista previa, «transcribiendo…».
 */
export default function TranscripcionEnVivo({
  textos,
  base,
  frases,
  parcial,
  vistaPrevia,
  pendientes,
}: {
  textos: TextoParte[];
  /** Última parte que ya había antes de esta sesión (al retomar). */
  base: number;
  frases: Frase[];
  parcial: string;
  /** La vista previa del navegador está encendida y funcionando. */
  vistaPrevia: boolean;
  /** Partes subidas que whisper todavía no termina. */
  pendientes: number;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const { texto, recortado } = colaDeTexto(textos);
  const nuevas = vistaPrevia ? frasesPendientes(frases, cubiertoHasta(textos, base)) : [];
  const enCurso = vistaPrevia ? parcial.trim() : "";

  useEffect(() => {
    const c = caja.current;
    if (c) c.scrollTop = c.scrollHeight;
  }, [texto, nuevas.length, enCurso]);

  const vacio = !texto && !nuevas.length && !enCurso;
  return (
    <div className={s.vivo}>
      <p className={s.notasTitle}>Transcripción en vivo</p>
      <div ref={caja} className={s.vivoTexto} aria-live="polite" aria-atomic="false">
        {vacio ? (
          <span className={s.vivoPrevia}>{vistaPrevia ? "Habla y aquí aparece lo que se dice…" : "Transcribiendo… el texto aparece cada ~20 segundos."}</span>
        ) : (
          <>
            {recortado ? "… " : ""}
            {texto}
            {nuevas.length ? <span className={s.vivoPrevia}> {nuevas.map((f) => f.texto.trim()).join(" ")}</span> : null}
            {enCurso ? <span className={s.vivoParcial}> {enCurso}</span> : null}
            {!vistaPrevia && pendientes > 0 ? <span className={s.vivoPrevia}> transcribiendo…</span> : null}
          </>
        )}
      </div>
    </div>
  );
}
