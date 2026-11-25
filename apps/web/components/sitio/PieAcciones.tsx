"use client";

import { useEffect, useState } from "react";
import { openCookiePreferences } from "@/lib/cookie-consent";
import { PAUSA_EVENTO, aplicarPausa, leerPausa } from "./pausa";
import TemaBoton from "./TemaBoton";

/** Botones de la fila legal: tema, pausa de las animaciones y preferencias de cookies. */
export default function PieAcciones({ className }: { className?: string }) {
  const [pausa, setPausa] = useState(false);
  useEffect(() => {
    setPausa(leerPausa());
    const alCambiar = (e: Event) => setPausa((e as CustomEvent<boolean>).detail);
    window.addEventListener(PAUSA_EVENTO, alCambiar);
    return () => window.removeEventListener(PAUSA_EVENTO, alCambiar);
  }, []);

  return (
    <>
      <TemaBoton className={className} conTexto />
      <button type="button" className={className} onClick={() => aplicarPausa(!pausa)}>
        {pausa ? "Reanudar animaciones" : "Pausar animaciones"}
      </button>
      <button type="button" className={className} onClick={() => openCookiePreferences()}>
        Gestionar cookies
      </button>
    </>
  );
}
