"use client";

import { useRef, type ReactNode } from "react";
import v from "./vivo.module.css";

/** Foto con esquinas de visor que se abre en grande. El `dialog` nativo trae el foco y la tecla Escape. */
export default function Ampliar({ src, pie, children, className = "" }: { src: string; pie: string; children: ReactNode; className?: string }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={`${v.ampliar} ${className}`} onClick={() => dialogo.current?.showModal()} aria-label={`Ampliar foto: ${pie}`}>
        {children}
        <span className={v.esquinas} aria-hidden="true" />
        <span className={v.ampliarIcono} aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3h5v5M8 17H3v-5M17 3l-6 6M3 17l6-6" />
          </svg>
        </span>
      </button>
      <dialog ref={dialogo} className={v.dialogo} aria-label={pie} onClick={(e) => e.target === e.currentTarget && dialogo.current?.close()}>
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" loading="lazy" decoding="async" />
          <figcaption>{pie}</figcaption>
        </figure>
        <button type="button" onClick={() => dialogo.current?.close()} aria-label="Cerrar">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l12 12M16 4L4 16" />
          </svg>
        </button>
      </dialog>
    </>
  );
}
