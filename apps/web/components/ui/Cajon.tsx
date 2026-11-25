"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import CloseIcon from "@mui/icons-material/Close";
import { Button } from "@/components/base";
import { useScrollLock } from "./useScrollLock";
import s from "./Cajon.module.css";

const ENFOCABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Panel lateral del sistema: atrapa el foco, cierra con Esc y devuelve el foco a quien lo abrió. */
export default function Cajon({
  titulo,
  subtitulo,
  children,
  pie,
  onCerrar,
}: {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
  pie?: ReactNode;
  onCerrar: () => void;
}) {
  const id = useId();
  const panel = useRef<HTMLElement | null>(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  useScrollLock(true);

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const el = panel.current;
    el?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cerrar.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const nodos = el.querySelectorAll<HTMLElement>(ENFOCABLE);
      if (!nodos.length) return;
      const primero = nodos[0];
      const ultimo = nodos[nodos.length - 1];
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === el)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      previo?.focus?.();
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={s.velo}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <aside ref={panel} className={s.cajon} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <header className={s.cabeza}>
          <div className={s.titulos}>
            <h2 id={id} className={s.titulo}>
              {titulo}
            </h2>
            {subtitulo ? <p className={s.sub}>{subtitulo}</p> : null}
          </div>
          <Button variant="ghost" size="sm" icon aria-label="Cerrar" onClick={onCerrar}>
            <CloseIcon fontSize="small" />
          </Button>
        </header>
        <div className={s.cuerpo}>{children}</div>
        {pie ? <footer className={s.pie}>{pie}</footer> : null}
      </aside>
    </div>,
    document.body,
  );
}
