"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { crearCircuitos, type Caja, type Circuitos, type Medidas } from "./circuitos-motor";
import { PAUSA_EVENTO, aplicarPausa, leerPausa } from "./pausa";
import base from "./sitio.module.css";
import e from "./ensamble.module.css";

/** La entrada se ve una vez por sesión; al recargar a propósito se vuelve a ver. */
const VISTA = "nx:intro";

type Props = { children: React.ReactNode; etiquetadoPor: string };

/**
 * Escenario del hero: monta el lienzo de circuitos sobre lo que el servidor ya pintó (emblema, nodos y texto) y lo
 * conecta con la página: mide dónde quedó cada cosa, sincroniza los pulsos con la entrada en CSS, manda un pulso al
 * nodo que la persona toca o enfoca, y ofrece la pausa de los pulsos de ambiente. Sin JavaScript el hero se ve
 * completo, solo sin pistas.
 */
export default function Escenario({ children, etiquetadoPor }: Props) {
  const raiz = useRef<HTMLElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const motor = useRef<Circuitos | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [pausa, setPausa] = useState(false);
  const [conMovimiento, setConMovimiento] = useState(false);

  useEffect(() => {
    const escenario = raiz.current;
    const c = lienzo.current;
    if (!escenario || !c) return;
    const html = document.documentElement;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setConMovimiento(!quieto);

    const enPausa = leerPausa();
    try {
      sessionStorage.setItem(VISTA, "1");
    } catch {
      /* almacenamiento bloqueado: la entrada se repite y la pausa dura lo que la página */
    }
    setPausa(enPausa);

    // Cuánto lleva la entrada en CSS (arrancó con el primer pintado, antes que este código).
    let entrada: number | null = null;
    if (!quieto && html.getAttribute("data-intro") !== "visto") {
      const reloj = escenario.getAnimations?.().find((a) => a.effect?.getComputedTiming().duration === 4000);
      entrada = typeof reloj?.currentTime === "number" ? reloj.currentTime / 1000 : 0;
    }

    const nodos = Array.from(escenario.querySelectorAll<HTMLElement>("[data-nx-nodo]"));
    const repetir = escenario.querySelector<HTMLButtonElement>("[data-nx-repetir]");
    if (repetir && quieto) {
      // Sin movimiento no hay nada que repetir: el emblema deja de ser un botón.
      repetir.disabled = true;
      repetir.setAttribute("aria-hidden", "true");
    }

    const medir = (): Medidas | null => {
      const marco = escenario.getBoundingClientRect();
      const emblema = escenario.querySelector("[data-nx-emblema]")?.getBoundingClientRect();
      if (!emblema || marco.width < 10) return null;
      const caja = (r: DOMRect): Caja => ({ x: r.left - marco.left, y: r.top - marco.top, w: r.width, h: r.height });
      const vetos = Array.from(escenario.querySelectorAll("[data-nx-veto]")).map((v) => {
        const k = caja(v.getBoundingClientRect());
        // En el teléfono no hay orillas junto al texto: la franja completa queda libre de pistas.
        return marco.width < 700 ? { x: 0, y: k.y, w: marco.width, h: k.h } : k;
      });
      for (const n of nodos) vetos.push(caja(n.getBoundingClientRect()));
      // El piso del escenario (el hilo de color) y la esquina del botón de pausa quedan sin pistas.
      vetos.push({ x: 0, y: marco.height - 18, w: marco.width, h: 18 });
      if (!quieto) vetos.push({ x: marco.width - 76, y: marco.height - 72, w: 76, h: 72 });
      return {
        ancho: marco.width,
        alto: marco.height,
        emblema: caja(emblema),
        destinos: nodos.map((n) => ({
          caja: caja((n.querySelector("[data-nx-hex]") ?? n).getBoundingClientRect()),
          color: getComputedStyle(n).getPropertyValue("--c").trim() || "#6ec6d9",
        })),
        vetos,
      };
    };

    const ondas: number[] = [];
    const m = crearCircuitos(c, {
      medir,
      entrada,
      quieto,
      alLlegar: (j) => {
        const n = nodos[j];
        if (!n) return;
        n.removeAttribute("data-llega");
        void n.offsetWidth; // reinicia la onda si llegan dos pulsos seguidos
        n.setAttribute("data-llega", "");
        ondas.push(window.setTimeout(() => n.removeAttribute("data-llega"), 750));
      },
    });
    motor.current = m;
    m.pausar(enPausa);

    const alTocar = nodos.map((n, j) => {
      const f = () => m.pulsar(j);
      n.addEventListener("pointerenter", f);
      n.addEventListener("focus", f);
      return () => {
        n.removeEventListener("pointerenter", f);
        n.removeEventListener("focus", f);
      };
    });

    let espera = 0;
    const ajustar = () => {
      window.clearTimeout(espera);
      espera = window.setTimeout(() => m.ajustar(), 160);
    };
    const tamano = new ResizeObserver(ajustar);
    tamano.observe(escenario);
    document.fonts?.ready.then(ajustar).catch(() => {});

    const vista = new IntersectionObserver(([x]) => m.visible(x.isIntersecting), { threshold: 0.02 });
    vista.observe(escenario);

    // Terminada la entrada, las siguientes visitas de la sesión (también al volver con el menú) llegan ya armadas.
    const sello = window.setTimeout(() => html.setAttribute("data-intro", "visto"), 2700);

    return () => {
      m.destruir();
      motor.current = null;
      alTocar.forEach((quita) => quita());
      tamano.disconnect();
      vista.disconnect();
      window.clearTimeout(espera);
      window.clearTimeout(sello);
      ondas.forEach((o) => window.clearTimeout(o));
    };
  }, [vuelta]);

  /** Tocar el emblema vuelve a montar el escenario: el CSS y el lienzo repiten la entrada desde cero. */
  const alPulsar = useCallback((ev: React.MouseEvent<HTMLElement>) => {
    if (!(ev.target as HTMLElement).closest("[data-nx-repetir]")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.documentElement.removeAttribute("data-intro");
    setVuelta((v) => v + 1);
  }, []);

  const alternarPausa = () => {
    const sigue = !pausa;
    aplicarPausa(sigue);
  };

  // La pausa es de todo el sitio: también se cambia desde el pie.
  useEffect(() => {
    const alCambiar = (ev: Event) => {
      const enPausa = (ev as CustomEvent<boolean>).detail;
      setPausa(enPausa);
      motor.current?.pausar(enPausa);
    };
    window.addEventListener(PAUSA_EVENTO, alCambiar);
    return () => window.removeEventListener(PAUSA_EVENTO, alCambiar);
  }, []);

  return (
    <section
      key={vuelta}
      ref={raiz}
      className={`${base.noche} ${e.hero}`}
      aria-labelledby={etiquetadoPor}
      data-nx-escenario=""
      data-hero-noche=""
      onClick={alPulsar}
    >
      <canvas ref={lienzo} className={e.lienzo} aria-hidden="true" />
      {children}
      {conMovimiento ? (
        <button type="button" className={e.pausa} onClick={alternarPausa} aria-label={pausa ? "Reanudar la animación" : "Pausar la animación"}>
          {pausa ? (
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M4.5 2.6v10.8a.6.6 0 0 0 .92.5l8.3-5.4a.6.6 0 0 0 0-1L5.42 2.1a.6.6 0 0 0-.92.5z" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect x="3.2" y="2.5" width="3.4" height="11" rx="1" />
              <rect x="9.4" y="2.5" width="3.4" height="11" rx="1" />
            </svg>
          )}
        </button>
      ) : null}
    </section>
  );
}
