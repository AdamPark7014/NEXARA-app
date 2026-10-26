"use client";

import { useRef } from "react";

/**
 * Vista doble sincronizada (como el mapa y la lista de Airbnb): al pasar el cursor o enfocar cualquier elemento con
 * `data-ciudad`, marca con `data-activa` todos los de esa misma ciudad dentro del bloque —la ficha de la lista y su
 * ruta y punto en el mapa— y pone `data-hay-activa` en el bloque para atenuar el resto.
 */
export default function Sincronia({ className, children }: { className?: string; children: React.ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null);

  const marcar = (nombre: string | null) => {
    const el = raiz.current;
    if (!el) return;
    el.querySelectorAll("[data-activa]").forEach((n) => n.removeAttribute("data-activa"));
    if (!nombre) {
      el.removeAttribute("data-hay-activa");
      return;
    }
    el.querySelectorAll(`[data-ciudad="${CSS.escape(nombre)}"]`).forEach((n) => n.setAttribute("data-activa", ""));
    el.setAttribute("data-hay-activa", "");
  };

  const ciudad = (destino: EventTarget | null) =>
    (destino as Element | null)?.closest?.("[data-ciudad]")?.getAttribute("data-ciudad") ?? null;

  return (
    <div
      ref={raiz}
      className={className}
      onPointerOver={(e) => marcar(ciudad(e.target))}
      onPointerLeave={() => marcar(null)}
      onFocus={(e) => marcar(ciudad(e.target))}
      onBlur={() => marcar(null)}
    >
      {children}
    </div>
  );
}
