"use client";

import { openCookiePreferences } from "@/lib/cookie-consent";
import TemaBoton from "./TemaBoton";

/** Botones de la fila legal: tema y preferencias de cookies. */
export default function PieAcciones({ className }: { className?: string }) {
  return (
    <>
      <TemaBoton className={className} conTexto />
      <button type="button" className={className} onClick={() => openCookiePreferences()}>
        Gestionar cookies
      </button>
    </>
  );
}
