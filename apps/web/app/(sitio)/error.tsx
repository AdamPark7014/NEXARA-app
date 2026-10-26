"use client";

import { useEffect } from "react";
import Link from "next/link";
import PublicIcon from "@/app/components/PublicIcon";
import s from "@/components/sitio/sitio.module.css";
import i from "@/components/sitio/interior.module.css";

export default function SitioError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Public route client error:", error);
  }, [error]);

  return (
    <main className={i.servicioPagina} aria-label="Error al cargar la página">
      <div className={`${i.panel} ${i.panelAngosto}`}>
        <span className={i.panelIcono}>
          <PublicIcon name="refresh" size={24} />
        </span>
        <h1 className={i.panelTitulo}>Algo no cargó bien</h1>
        <p className={i.panelTexto}>Vuelve a intentarlo. Si sigue pasando, recarga la página o escríbenos.</p>
        <div className={i.panelAcciones}>
          <button type="button" className={`${s.boton} ${s.botonPrimario}`} onClick={reset}>
            Reintentar
          </button>
          <Link href="/contacto" className={`${s.boton} ${s.botonSecundario}`}>
            Contacto
          </Link>
        </div>
      </div>
    </main>
  );
}
