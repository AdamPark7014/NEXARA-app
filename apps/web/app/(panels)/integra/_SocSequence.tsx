"use client";

/**
 * Secuencia de accesos correlacionada: una puerta, una ventana de tiempo, una
 * historia.
 *
 * Un acceso denegado, un reintento y una entrada concedida en la misma puerta y
 * el mismo minuto son el MISMO suceso. Verlos como tres tarjetas sueltas en una
 * rejilla obliga al operador a reconstruir a mano lo que el sistema ya sabe.
 * Aquí se pintan como un carril con su hilo temporal.
 *
 * La correlación en sí vive en `correlateEvents()` (`_soc.ts`), que es lógica
 * pura y tiene pruebas. Esto es solo su forma en pantalla.
 */

import BlockIcon from "@mui/icons-material/Block";
import LoginIcon from "@mui/icons-material/Login";
import SensorsIcon from "@mui/icons-material/Sensors";

import { repeatsOf, type PushEvent } from "./_DetectionOverlay";
import styles from "./_soc.module.css";
import {
  fmtTime,
  outcomeOf,
  sequenceStory,
  type EventOutcome,
  type EventSequence,
} from "./_soc";

/** Cuántos eventos se pintan por secuencia antes de resumir el resto. */
const MAX_VISIBLE = 8;

function OutcomeIcon({ outcome }: { outcome: EventOutcome }) {
  if (outcome === "denied") return <BlockIcon aria-hidden />;
  if (outcome === "granted") return <LoginIcon aria-hidden />;
  return <SensorsIcon aria-hidden />;
}

function dotTone(outcome: EventOutcome): "danger" | "ok" | undefined {
  if (outcome === "denied") return "danger";
  if (outcome === "granted") return "ok";
  return undefined;
}

/** Texto del resultado para lector de pantalla: el icono solo no dice nada. */
function outcomeWord(outcome: EventOutcome): string {
  if (outcome === "denied") return "denegado";
  if (outcome === "granted") return "concedido";
  return "evento de equipo";
}

export function SocSequenceCard({
  seq,
  selectedId,
  onSelect,
}: {
  seq: EventSequence;
  selectedId?: number | null;
  onSelect?: (ev: PushEvent) => void;
}) {
  const visible = seq.events.slice(0, MAX_VISIBLE);
  const hidden = seq.events.length - visible.length;
  const spans = seq.to - seq.from >= 1000;

  return (
    <article className={styles.seqCard} data-tone={seq.tone}>
      <header className={styles.seqHead}>
        <span className={styles.seqDoor}>{seq.doorLabel}</span>
        <span className={styles.seqWindow}>
          {spans ? `${fmtTime(seq.from)} → ${fmtTime(seq.to)}` : fmtTime(seq.to)}
        </span>
        <span className={styles.seqTags}>
          {seq.denied > 0 && (
            <span className={styles.tag} data-tone="danger">
              {seq.denied} denegado{seq.denied === 1 ? "" : "s"}
            </span>
          )}
          {seq.granted > 0 && (
            <span className={styles.tag} data-tone="ok">
              {seq.granted} concedido{seq.granted === 1 ? "" : "s"}
            </span>
          )}
          <span className={styles.tag}>
            {seq.events.length} evento{seq.events.length === 1 ? "" : "s"}
          </span>
        </span>
      </header>

      <p className={styles.seqStory}>{sequenceStory(seq)}</p>

      <div className={styles.seqRail}>
        {visible.map((ev) => {
          const outcome = outcomeOf(ev);
          const repeats = repeatsOf(ev);
          const who = ev.personName?.trim() || ev.personId || "Sin identidad ACS";
          const what = ev.label || outcomeWord(outcome);
          return (
            <button
              key={ev.id}
              type="button"
              className={styles.seqItem}
              data-selected={selectedId === ev.id ? "1" : undefined}
              onClick={onSelect ? () => onSelect(ev) : undefined}
              aria-label={`${fmtTime(Date.parse(ev.occurredAt))}, ${who}, ${what}. Ver detalle`}
            >
              <span className={styles.seqTime}>{fmtTime(Date.parse(ev.occurredAt))}</span>
              <span className={styles.seqDot} data-tone={dotTone(outcome)}>
                <OutcomeIcon outcome={outcome} />
              </span>
              <span className={styles.seqWho}>
                <span className={styles.seqName}>{who}</span>
                <span className={styles.seqLabel}>
                  {what}
                  {ev.verifyMode ? ` · ${ev.verifyMode}` : ""}
                </span>
              </span>
              {/* `activePostCount` lo manda el propio terminal: cuántas veces
                  repitió ESTE aviso. No es una cuenta nuestra. */}
              <span className={styles.seqRepeat}>{repeats > 1 ? `×${repeats}` : ""}</span>
            </button>
          );
        })}
        {hidden > 0 && (
          <p className={styles.seqMore}>
            y {hidden} evento{hidden === 1 ? "" : "s"} más en esta misma ventana
          </p>
        )}
      </div>
    </article>
  );
}

export function SocSequenceList({
  sequences,
  selectedId,
  onSelect,
}: {
  sequences: readonly EventSequence[];
  selectedId?: number | null;
  onSelect?: (ev: PushEvent) => void;
}) {
  return (
    <div className={styles.seqList}>
      {sequences.map((seq) => (
        <SocSequenceCard
          key={`${seq.key}-${seq.from}`}
          seq={seq}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
