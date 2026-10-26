"use client";

import { useEffect, useState } from "react";
import { applyPublicTheme } from "@/components/PublicThemeToggle";

type Tema = "dark" | "light";

const leerTema = (): Tema =>
  document.documentElement.getAttribute("data-public-theme") === "dark" ? "dark" : "light";

/** Cambia entre claro y oscuro con el mismo mecanismo del sitio (`data-public-theme`). */
export default function TemaBoton({ className, conTexto = false }: { className?: string; conTexto?: boolean }) {
  const [tema, setTema] = useState<Tema>("light");

  useEffect(() => {
    setTema(leerTema());
    const alCambiar = () => setTema(leerTema());
    window.addEventListener("nexara:public-theme", alCambiar);
    return () => window.removeEventListener("nexara:public-theme", alCambiar);
  }, []);

  const etiqueta = tema === "dark" ? "Usar tema claro" : "Usar tema oscuro";

  return (
    <button
      type="button"
      className={className}
      onClick={() => applyPublicTheme(tema === "dark" ? "light" : "dark")}
      aria-label={etiqueta}
      title={etiqueta}
    >
      {tema === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
        </svg>
      )}
      {conTexto ? <span>{tema === "dark" ? "Tema claro" : "Tema oscuro"}</span> : null}
    </button>
  );
}
