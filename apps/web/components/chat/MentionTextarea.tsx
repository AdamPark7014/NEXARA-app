"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { applyDisplayEdit, mentionAtCaret, toDisplay } from "@/lib/chat-mentions";
import styles from "./MentionTextarea.module.css";

export type MentionTextareaHandle = {
  focus: () => void;
  /** Inserta texto plano (un emoji, por ejemplo) donde está el cursor. */
  insertText: (text: string) => void;
  /** Markdown guardado, por si el padre lo necesita fuera del estado. */
  getMarkup: () => string;
};

type Props = {
  /** Markdown guardado — el formato que viaja a la API, sin tocar. */
  value: string;
  onChange: (markup: string) => void;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: ReactClipboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  /** Clase del `textarea` — la hereda del compositor que lo usa. */
  className?: string;
  "aria-label"?: string;
  id?: string;
};

/**
 * Propiedades que el espejo copia del `textarea` para que cada carácter caiga en
 * el mismo píxel. Se copian en vez de duplicarse en CSS porque el compositor del
 * canal y el del hilo traen su propia clase y su propio relleno.
 */
const METRICAS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "letterSpacing",
  "wordSpacing",
  "lineHeight",
  "textTransform",
  "textIndent",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "boxSizing",
] as const;

/**
 * Compositor con menciones en pastilla.
 *
 * El `textarea` conserva el texto **visible** (`@Adam Pozo`, `AN-0015 · …`) y el
 * markdown guardado vive en el estado del padre. Encima se pinta un espejo con
 * las mismas métricas que dibuja el fondo redondeado de cada mención; el
 * `textarea` va con la tinta transparente y el cursor visible, así que el
 * cuidado de la selección, el IME, el deshacer y el lector de pantalla siguen
 * siendo los nativos.
 *
 * La pastilla se borra como una unidad: eso pasa en `applyDisplayEdit`, que
 * expande cualquier borrado que roce una mención al token entero.
 */
const MentionTextarea = forwardRef<MentionTextareaHandle, Props>(function MentionTextarea(
  {
    value,
    onChange,
    onKeyDown,
    onPaste,
    placeholder,
    rows = 2,
    disabled,
    className,
    id,
    "aria-label": ariaLabel,
  },
  ref,
) {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const espejoRef = useRef<HTMLDivElement | null>(null);
  const caretPendiente = useRef<number | null>(null);
  const [aviso, setAviso] = useState("");

  const display = useMemo(() => toDisplay(value), [value]);

  // El espejo hereda tipografía y relleno del textarea real: sin esto, el texto
  // pintado y el texto escrito se separan en cuanto cambia un padding.
  const sincronizarMetricas = useCallback(() => {
    const area = areaRef.current;
    const espejo = espejoRef.current;
    if (!area || !espejo || typeof window.getComputedStyle !== "function") return;
    const cs = window.getComputedStyle(area);
    const destino = espejo.style as unknown as Record<string, string>;
    for (const prop of METRICAS) {
      const valor = cs[prop];
      if (typeof valor === "string" && valor) destino[prop] = valor;
    }
  }, []);

  useLayoutEffect(() => {
    sincronizarMetricas();
    if (typeof window === "undefined") return;
    window.addEventListener("resize", sincronizarMetricas);
    return () => window.removeEventListener("resize", sincronizarMetricas);
  }, [sincronizarMetricas]);

  // Reponer el cursor: React reescribe el valor entero del textarea y sin esto
  // el cursor salta al final en cuanto se escribe en medio de una frase.
  useLayoutEffect(() => {
    const area = areaRef.current;
    const pos = caretPendiente.current;
    caretPendiente.current = null;
    if (!area || pos == null) return;
    const limite = Math.min(pos, area.value.length);
    if (area.selectionStart !== limite || area.selectionEnd !== limite) {
      area.setSelectionRange(limite, limite);
    }
  }, [display.text]);

  // El aviso al lector de pantalla se limpia solo; si se queda, lo repite al
  // siguiente cambio de foco y estorba.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 2500);
    return () => clearTimeout(t);
  }, [aviso]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => areaRef.current?.focus(),
      getMarkup: () => value,
      insertText: (texto: string) => {
        const area = areaRef.current;
        const caret = area?.selectionStart ?? display.text.length;
        const fin = area?.selectionEnd ?? caret;
        const siguiente = display.text.slice(0, caret) + texto + display.text.slice(fin);
        const res = applyDisplayEdit({
          markup: value,
          prevDisplay: display.text,
          nextDisplay: siguiente,
          caret: caret + texto.length,
        });
        caretPendiente.current = res.caret;
        onChange(res.markup);
      },
    }),
    [value, display.text, onChange],
  );

  const alEscribir = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // Anunciar la mención antes de que desaparezca: el borrado lo hace el
    // manejador de cambio, que se la lleva entera.
    if (e.key === "Backspace" || e.key === "Delete") {
      const area = e.currentTarget;
      const inicio = area.selectionStart ?? 0;
      const fin = area.selectionEnd ?? inicio;
      const objetivo =
        inicio !== fin
          ? mentionAtCaret(value, inicio, fin)
          : e.key === "Backspace"
            ? mentionAtCaret(value, inicio, inicio)
            : mentionAtCaret(value, inicio, inicio + 1);
      if (objetivo) setAviso(`Mención ${objetivo.label} eliminada`);
    }
    onKeyDown?.(e);
  };

  const nodos = useMemo<ReactNode[]>(() => {
    const out: ReactNode[] = [];
    let cursor = 0;
    display.mentions.forEach((m, i) => {
      if (m.start > cursor) out.push(display.text.slice(cursor, m.start));
      out.push(
        <span
          key={`m-${i}`}
          className={`${styles.pill} ${m.kind === "user" ? styles.pillUser : styles.pillEntity}`}
          title={m.label}
        >
          {m.display}
        </span>,
      );
      cursor = m.end;
    });
    if (cursor < display.text.length) out.push(display.text.slice(cursor));
    // Ancla sin ancho: mantiene el alto del último renglón cuando termina en salto.
    out.push("​");
    return out;
  }, [display]);

  return (
    <div className={styles.wrap}>
      <div ref={espejoRef} className={styles.mirror} aria-hidden="true">
        {nodos}
      </div>
      <textarea
        ref={areaRef}
        id={id}
        aria-label={ariaLabel}
        className={`${className ?? ""} ${styles.input}`.trim()}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        value={display.text}
        spellCheck
        onChange={(e) => {
          const el = e.currentTarget;
          const siguiente = el.value;
          const caret = el.selectionStart ?? siguiente.length;
          const res = applyDisplayEdit({
            markup: value,
            prevDisplay: display.text,
            nextDisplay: siguiente,
            caret,
          });
          caretPendiente.current = res.caret;
          if (res.removed.length) {
            setAviso(`Mención ${res.removed.map((m) => m.label).join(", ")} eliminada`);
          }
          onChange(res.markup);
        }}
        onKeyDown={alEscribir}
        onPaste={onPaste}
        onScroll={(e) => {
          const espejo = espejoRef.current;
          if (espejo) espejo.scrollTop = e.currentTarget.scrollTop;
        }}
      />
      <span className={styles.announce} role="status" aria-live="polite">
        {aviso}
      </span>
    </div>
  );
});

export default MentionTextarea;
