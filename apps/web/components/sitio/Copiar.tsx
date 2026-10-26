"use client";

import { useEffect, useState } from "react";
import p from "./paginas.module.css";

/** Botón pequeño que copia un dato y lo confirma («Copiado») durante un momento. */
export default function Copiar({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  const [hecho, setHecho] = useState(false);

  useEffect(() => {
    if (!hecho) return;
    const id = window.setTimeout(() => setHecho(false), 1600);
    return () => window.clearTimeout(id);
  }, [hecho]);

  return (
    <button
      type="button"
      className={p.copiar}
      data-hecho={hecho ? "true" : undefined}
      aria-label={hecho ? `${etiqueta} copiado` : `Copiar ${etiqueta}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valor);
          setHecho(true);
        } catch {
          /* sin permiso de portapapeles: el dato sigue visible para copiarlo a mano */
        }
      }}
    >
      <span aria-live="polite">{hecho ? "Copiado" : "Copiar"}</span>
    </button>
  );
}
