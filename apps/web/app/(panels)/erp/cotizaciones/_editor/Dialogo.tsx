"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./editor.module.css";

/** Diálogo modal con Esc, clic fuera y foco atrapado (sin depender de `<dialog>`). */
export default function Dialogo({
  titulo,
  onCerrar,
  children,
  pie,
  ocupado = false,
}: {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  pie: ReactNode;
  ocupado?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  // En el <body>: dentro del contenido quedaba debajo de la barra del panel sin oscurecerla.
  const [destino, setDestino] = useState<HTMLElement | null>(null);
  useEffect(() => setDestino(document.body), []);

  useEffect(() => {
    if (!destino) return;
    const previo = document.activeElement as HTMLElement | null;
    const primero = panel.current?.querySelector<HTMLElement>("input, textarea, select, button");
    primero?.focus();

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !ocupado) {
        e.preventDefault();
        onCerrar();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const enfocables = panel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      if (!enfocables.length) return;
      const inicio = enfocables[0]!;
      const fin = enfocables[enfocables.length - 1]!;
      if (e.shiftKey && document.activeElement === inicio) {
        e.preventDefault();
        fin.focus();
      } else if (!e.shiftKey && document.activeElement === fin) {
        e.preventDefault();
        inicio.focus();
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      previo?.focus?.();
    };
    // Solo al abrir/cerrar (y cuando el portal ya existe).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destino]);

  const contenido = (
    <div
      className={styles.fondo}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !ocupado) onCerrar();
      }}
    >
      <div ref={panel} className={styles.dialogo} role="dialog" aria-modal="true" aria-labelledby={tituloId}>
        <h2 id={tituloId} className={styles.dialogoTitulo}>
          {titulo}
        </h2>
        {children}
        <div className={styles.dialogoPie}>{pie}</div>
      </div>
    </div>
  );
  return destino ? createPortal(contenido, destino) : null;
}
