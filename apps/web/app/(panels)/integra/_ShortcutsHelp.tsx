"use client";

import { useEffect, useRef } from "react";
import CloseIcon from "@mui/icons-material/Close";
import wall from "./_wall.module.css";

/** Un atajo: teclas y qué hace. */
type Shortcut = { keys: string[]; what: string };

const SHORTCUTS: Shortcut[] = [
  { keys: ["1"], what: "Rejilla 1 (una cámara)" },
  { keys: ["2"], what: "Rejilla 2×2 (4)" },
  { keys: ["3"], what: "Rejilla 3×3 (9)" },
  { keys: ["4"], what: "Rejilla 4×4 (16)" },
  { keys: ["←", "→", "↑", "↓"], what: "Mover la selección por el muro" },
  { keys: ["Enter"], what: "Abrir la celda seleccionada en foco" },
  { keys: ["Espacio"], what: "Pausar / reanudar la imagen seleccionada" },
  { keys: ["F"], what: "Pantalla completa del mosaico seleccionado" },
  { keys: ["Shift", "F"], what: "Pantalla completa de la rejilla entera" },
  { keys: ["M"], what: "Recoger la celda y, con otra elegida, intercambiar" },
  { keys: ["Supr"], what: "Quitar del muro la cámara seleccionada" },
  { keys: ["/"], what: "Ir al buscador de cámaras" },
  { keys: ["W"], what: "Vista muro" },
  { keys: ["E"], what: "Vista foco" },
  { keys: ["Esc"], what: "Salir de foco, de pantalla completa o cerrar" },
  { keys: ["?"], what: "Esta ayuda" },
];

export function WallShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={wall.modalBackdrop}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={wall.modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wall-shortcuts-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={wall.modalHead}>
          <strong className={wall.modalTitle} id="wall-shortcuts-title">
            Atajos de teclado del muro
          </strong>
          <button
            ref={closeRef}
            type="button"
            className={wall.iconBtn}
            data-tone="light"
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar ayuda de atajos"
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </button>
        </div>
        <ul className={wall.shortcutList}>
          {SHORTCUTS.map((s) => (
            <li className={wall.shortcutRow} key={s.keys.join("+") + s.what}>
              <span>{s.what}</span>
              <span className={wall.shortcutKeys}>
                {s.keys.map((k) => (
                  <kbd className={wall.kbd} key={k}>
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className={wall.modalNote}>
          Los atajos se desactivan mientras escribes en un campo de texto o
          eliges en un desplegable. Dentro del PTZ, las flechas y +/− mueven la
          domo en lugar de la selección.
        </p>
      </div>
    </div>
  );
}
