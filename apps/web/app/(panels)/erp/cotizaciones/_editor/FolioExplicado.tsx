"use client";

import { explicarFolio, type PersonaFolio } from "@/lib/cotizacion-folio";
import styles from "./editor.module.css";

/**
 * El folio pieza por pieza: qué dice cada parte (de quién es, qué número lleva, quién intervino,
 * en qué revisión va). Es la nomenclatura de seguimiento que pidió dirección.
 */
export default function FolioExplicado({
  folio,
  elaboro,
  intervinieron,
  revision,
  pendientes,
}: {
  folio: string;
  elaboro?: PersonaFolio | null;
  intervinieron?: PersonaFolio[];
  revision?: number | null;
  /** Lo que se le agregará al enviarla (se enseña antes de que pase). */
  pendientes?: string | null;
}) {
  const explicado = explicarFolio(folio, { elaboro, intervinieron, revision });
  return (
    <div className={styles.folio}>
      <ol className={styles.folioPiezas} aria-label={`Folio ${folio}`}>
        {explicado.piezas.map((pieza, i) => (
          <li key={`${pieza.tipo}-${i}`} className={`${styles.pieza} ${styles[`pieza_${pieza.tipo}`] ?? ""}`}>
            <span className={styles.piezaTexto}>{pieza.texto}</span>
            <span className={styles.piezaSignifica}>{pieza.significa}</span>
          </li>
        ))}
      </ol>
      <p className={styles.folioResumen}>{explicado.resumen}</p>
      {pendientes ? <p className={styles.pista}>{pendientes}</p> : null}
      {explicado.aviso ? <p className={styles.pista}>{explicado.aviso}</p> : null}
    </div>
  );
}
