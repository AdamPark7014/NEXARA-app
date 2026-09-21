"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  EMOJI_GROUPS,
  STICKERS,
  loadRecentEmoji,
  pushRecentEmoji,
  searchEmoji,
  type EmojiEntry,
} from "@/lib/chat-emoji";
import styles from "./EmojiPicker.module.css";

const COLUMNAS = 8;

type Props = {
  /** Insertar en el mensaje, o mandar como reacción. */
  onSelect: (char: string) => void;
  /** Mandar de inmediato como sticker. Sin esto no se muestra la pestaña. */
  onSticker?: (char: string) => void;
  onClose: () => void;
  /** Nombre accesible del panel. */
  title: string;
  /** Posicionamiento, que lo decide quien lo abre. */
  className?: string;
  /** A dónde vuelve el foco al cerrar. */
  returnFocusTo?: RefObject<HTMLElement | null>;
};

/**
 * Selector de emoji — el mismo para escribir y para reaccionar.
 *
 * Se abre y se recorre con teclado: la búsqueda toma el foco al abrir, las
 * flechas mueven por la rejilla (tabulación itinerante, un solo parador de
 * tabulador), Inicio/Fin saltan a los extremos, Enter elige y Esc cierra
 * devolviendo el foco al botón que lo abrió.
 */
export default function EmojiPicker({
  onSelect,
  onSticker,
  onClose,
  title,
  className,
  returnFocusTo,
}: Props) {
  const [q, setQ] = useState("");
  const [grupo, setGrupo] = useState<string>(onSticker ? "recientes" : EMOJI_GROUPS[0].id);
  const [activo, setActivo] = useState(0);
  const [recientes, setRecientes] = useState<string[]>([]);
  const cajaRef = useRef<HTMLDivElement | null>(null);
  const buscadorRef = useRef<HTMLInputElement | null>(null);
  const botonesRef = useRef<Array<HTMLButtonElement | null>>([]);
  const enRejilla = useRef(false);

  useEffect(() => {
    setRecientes(loadRecentEmoji());
    buscadorRef.current?.focus();
  }, []);

  // Cerrar al pulsar fuera. Va en `mousedown` para que no se adelante el clic
  // que abrió otro panel.
  useEffect(() => {
    const fuera = (e: globalThis.MouseEvent) => {
      const caja = cajaRef.current;
      if (caja && !caja.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [onClose]);

  const cerrar = () => {
    onClose();
    returnFocusTo?.current?.focus();
  };

  const esStickers = grupo === "stickers" && !!onSticker;

  const visibles: EmojiEntry[] = useMemo(() => {
    if (q.trim()) return searchEmoji(q);
    if (esStickers) return STICKERS;
    if (grupo === "recientes") {
      const mapa = new Map(EMOJI_GROUPS.flatMap((g) => g.emojis).map((e) => [e.char, e]));
      const lista = recientes
        .map((c) => mapa.get(c) ?? { char: c, name: "emoji", keywords: "" })
        .slice(0, COLUMNAS * 3);
      return lista.length ? lista : STICKERS.slice(0, COLUMNAS * 2);
    }
    return EMOJI_GROUPS.find((g) => g.id === grupo)?.emojis ?? [];
  }, [q, grupo, recientes, esStickers]);

  useEffect(() => {
    setActivo(0);
    enRejilla.current = false;
  }, [q, grupo]);

  useEffect(() => {
    if (!enRejilla.current) return;
    botonesRef.current[activo]?.focus();
  }, [activo, visibles]);

  const elegir = (entry: EmojiEntry) => {
    setRecientes((prev) => pushRecentEmoji(entry.char, prev));
    if (esStickers && onSticker) onSticker(entry.char);
    else onSelect(entry.char);
  };

  const mover = (delta: number) => {
    if (!visibles.length) return;
    enRejilla.current = true;
    setActivo((i) => Math.min(visibles.length - 1, Math.max(0, i + delta)));
  };

  const pestañas = [
    ...(onSticker ? [{ id: "recientes", icon: "🕘", label: "Recientes" }] : []),
    ...EMOJI_GROUPS.map((g) => ({ id: g.id, icon: g.icon, label: g.label })),
    ...(onSticker ? [{ id: "stickers", icon: "🏷️", label: "Stickers" }] : []),
  ];

  return (
    <div
      ref={cajaRef}
      className={`${styles.panel} ${className ?? ""}`.trim()}
      role="dialog"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cerrar();
        }
      }}
    >
      <input
        ref={buscadorRef}
        type="search"
        className={styles.search}
        value={q}
        placeholder="Buscar emoji…"
        aria-label="Buscar emoji por nombre"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || (e.key === "Enter" && visibles.length)) {
            e.preventDefault();
            enRejilla.current = true;
            setActivo(0);
            botonesRef.current[0]?.focus();
          }
        }}
      />

      {!q.trim() && (
        <div className={styles.tabs} role="tablist" aria-label="Categorías de emoji">
          {pestañas.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={grupo === p.id}
              aria-label={p.label}
              title={p.label}
              className={`${styles.tab} ${grupo === p.id ? styles.tabActive : ""}`}
              onClick={() => setGrupo(p.id)}
            >
              <span aria-hidden="true">{p.icon}</span>
            </button>
          ))}
        </div>
      )}

      {esStickers && (
        <p className={styles.nota}>
          Se manda solo, y se ve en grande. Sin archivos que subir.
        </p>
      )}

      <div
        className={`${styles.grid} ${esStickers ? styles.gridStickers : ""}`}
        role="listbox"
        aria-label={esStickers ? "Stickers" : "Emojis"}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            mover(1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            mover(-1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            mover(COLUMNAS);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (activo < COLUMNAS) buscadorRef.current?.focus();
            else mover(-COLUMNAS);
          } else if (e.key === "Home") {
            e.preventDefault();
            mover(-visibles.length);
          } else if (e.key === "End") {
            e.preventDefault();
            mover(visibles.length);
          }
        }}
      >
        {visibles.length === 0 ? (
          <p className={styles.vacio}>Nada con «{q.trim()}».</p>
        ) : (
          visibles.map((entry, i) => (
            <button
              key={`${entry.char}-${i}`}
              type="button"
              role="option"
              aria-selected={i === activo}
              ref={(el) => {
                botonesRef.current[i] = el;
              }}
              tabIndex={i === activo ? 0 : -1}
              className={`${styles.item} ${esStickers ? styles.itemSticker : ""}`}
              title={entry.name}
              aria-label={entry.name}
              onFocus={() => {
                enRejilla.current = true;
                setActivo(i);
              }}
              onClick={() => elegir(entry)}
            >
              <span aria-hidden="true">{entry.char}</span>
              {esStickers && <span className={styles.itemNombre}>{entry.name}</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
