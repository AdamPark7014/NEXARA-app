"use client";

import { memo, useCallback, useRef, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import CloseIcon from "@mui/icons-material/Close";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import styles from "./integra.module.css";
import wall from "./_wall.module.css";

/**
 * Una celda del muro.
 *
 * Va memoizada a propósito: seleccionar con las flechas, arrastrar o abrir la
 * ayuda re-renderiza la página entera, y sin `memo` eso arrastraba a los
 * dieciséis reproductores. Todos los callbacks que llegan aquí son estables
 * (`useCallback` en el padre) y el índice de la celda se pasa como número, no
 * como cierre nuevo por render.
 */

export const WALL_DND_MIME = "application/x-nexara-wall";

/** Carga útil del arrastre: de dónde viene y qué cámara es. */
export type WallDragPayload = {
  cameraId: string;
  /** Índice de celda de origen, o `null` si viene del rail lateral. */
  fromIndex: number | null;
};

export function encodeWallDrag(p: WallDragPayload): string {
  return `${p.fromIndex ?? ""}|${p.cameraId}`;
}

export function decodeWallDrag(raw: string): WallDragPayload | null {
  const i = raw.indexOf("|");
  if (i < 0) return null;
  const from = raw.slice(0, i);
  const cameraId = raw.slice(i + 1);
  if (!cameraId) return null;
  const n = from === "" ? null : Number(from);
  return { cameraId, fromIndex: n != null && Number.isInteger(n) && n >= 0 ? n : null };
}

type Props = {
  index: number;
  cameraId: string;
  name: string;
  selected: boolean;
  /** Celda «recogida» con `M`: la alternativa por teclado al arrastre. */
  picked: boolean;
  children: ReactNode;
  onSelect: (index: number) => void;
  onOpenFocus: (cameraId: string) => void;
  onRemove: (cameraId: string) => void;
  onFullscreen: (index: number, el: HTMLElement | null) => void;
  onDropOnCell: (targetIndex: number, payload: WallDragPayload) => void;
  onKeyCommand: (index: number, key: string, el: HTMLElement | null) => void;
  registerEl: (index: number, el: HTMLDivElement | null) => void;
};

function WallCellImpl({
  index,
  cameraId,
  name,
  selected,
  picked,
  children,
  onSelect,
  onOpenFocus,
  onRemove,
  onFullscreen,
  onDropOnCell,
  onKeyCommand,
  registerEl,
}: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      elRef.current = el;
      registerEl(index, el);
    },
    [index, registerEl],
  );

  /**
   * `dragover` dispara decenas de veces por segundo. Marcar el objetivo con un
   * `data-` directamente sobre el nodo evita un `setState` por cada píxel —que
   * es exactamente el re-render del muro entero que hay que evitar.
   */
  const markDrop = useCallback((el: HTMLElement | null, on: boolean) => {
    if (!el) return;
    if (on) el.dataset.drop = "1";
    else delete el.dataset.drop;
  }, []);

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData(WALL_DND_MIME, encodeWallDrag({ cameraId, fromIndex: index }));
      e.dataTransfer.setData("text/plain", name);
      e.dataTransfer.effectAllowed = "move";
      if (elRef.current) elRef.current.dataset.dragging = "1";
    },
    [cameraId, index, name],
  );

  const handleDragEnd = useCallback(() => {
    if (elRef.current) delete elRef.current.dataset.dragging;
  }, []);

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes(WALL_DND_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      markDrop(e.currentTarget, true);
    },
    [markDrop],
  );

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      markDrop(e.currentTarget, false);
    },
    [markDrop],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      markDrop(e.currentTarget, false);
      const raw = e.dataTransfer.getData(WALL_DND_MIME);
      if (!raw) return;
      e.preventDefault();
      const payload = decodeWallDrag(raw);
      if (payload) onDropOnCell(index, payload);
    },
    [index, markDrop, onDropOnCell],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // Enter y Espacio abren el foco: hasta ahora solo respondía a Enter y el
      // Espacio hacía scroll de la página con la celda enfocada.
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        e.stopPropagation();
        onOpenFocus(cameraId);
        return;
      }
      if (e.key === "m" || e.key === "M" || e.key === "Delete") {
        e.preventDefault();
        e.stopPropagation();
        onKeyCommand(index, e.key === "Delete" ? "Delete" : "m", elRef.current);
      }
    },
    [cameraId, index, onKeyCommand, onOpenFocus],
  );

  return (
    <div
      ref={setRef}
      className={`${styles.wallCell} ${wall.cell}`}
      data-cell-index={index}
      data-selected={selected ? "1" : undefined}
      data-picked={picked ? "1" : undefined}
      role="gridcell"
      aria-label={`Celda ${index + 1}: ${name}${picked ? " (recogida para mover)" : ""}`}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => onSelect(index)}
      onDoubleClick={() => onOpenFocus(cameraId)}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.wallCellHead}>
        <span className={wall.grip} aria-hidden="true">
          <DragIndicatorIcon sx={{ fontSize: 13 }} />
        </span>
        <span className={wall.cellNum} aria-hidden="true">
          {index + 1}
        </span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}
        </span>
        {picked && <span className={wall.pickedFlag}>mover</span>}
        <div className={styles.wallCellActions}>
          <button
            type="button"
            className={wall.iconBtn}
            title="Pantalla completa de este mosaico (F)"
            aria-label={`Pantalla completa de ${name}`}
            onClick={(ev) => {
              ev.stopPropagation();
              onFullscreen(index, elRef.current);
            }}
          >
            <FullscreenIcon sx={{ fontSize: 15 }} />
          </button>
          <button
            type="button"
            className={wall.iconBtn}
            title="Abrir en foco"
            aria-label={`Abrir ${name} en foco`}
            onClick={(ev) => {
              ev.stopPropagation();
              onOpenFocus(cameraId);
            }}
          >
            <OpenInFullIcon sx={{ fontSize: 14 }} />
          </button>
          <button
            type="button"
            className={wall.iconBtn}
            title="Quitar del muro (Supr)"
            aria-label={`Quitar ${name} del muro`}
            onClick={(ev) => {
              ev.stopPropagation();
              onRemove(cameraId);
            }}
          >
            <CloseIcon sx={{ fontSize: 15 }} />
          </button>
        </div>
      </div>
      <div className={`${styles.wallCellBody} ${wall.cellBody}`}>{children}</div>
    </div>
  );
}

export const WallCell = memo(WallCellImpl);

/** Hueco vacío: también acepta que le suelten una cámara encima. */
export const WallEmptyCell = memo(function WallEmptyCell({
  index,
  layout,
  disabled,
  onAdd,
  onDropOnCell,
}: {
  index: number;
  layout: number;
  disabled: boolean;
  onAdd: (index: number) => void;
  onDropOnCell: (targetIndex: number, payload: WallDragPayload) => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.wallEmpty} ${wall.emptyDrop}`}
      role="gridcell"
      aria-label={`Celda ${index + 1} de ${layout}, vacía. Añadir cámara`}
      disabled={disabled}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(WALL_DND_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        e.currentTarget.dataset.drop = "1";
      }}
      onDragLeave={(e) => {
        delete e.currentTarget.dataset.drop;
      }}
      onDrop={(e) => {
        delete e.currentTarget.dataset.drop;
        const raw = e.dataTransfer.getData(WALL_DND_MIME);
        if (!raw) return;
        e.preventDefault();
        const payload = decodeWallDrag(raw);
        if (payload) onDropOnCell(index, payload);
      }}
      onClick={() => onAdd(index)}
    >
      <span className={styles.wallEmptyPlus} aria-hidden="true">
        +
      </span>
      <span>Añadir cámara</span>
      <span className={styles.wallEmptyMeta}>
        Slot {index + 1}/{layout} · o arrastra una de la lista
      </span>
    </button>
  );
});
