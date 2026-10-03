"use client";

/**
 * Lector de códigos de barras USB.
 *
 * Un lector USB no es un dispositivo especial: se presenta como teclado y «teclea» el
 * código de corrido, terminado en Enter. Lo único que lo distingue de una persona es
 * la velocidad: entre tecla y tecla pasan pocos milisegundos, y nadie escribe así.
 *
 * `useLectorDeCodigos` escucha esa ráfaga en toda la pantalla, para que el almacén no
 * tenga que hacer clic en un campo antes de disparar. Lo que NO hace es estorbar a
 * quien escribe: si el foco está en un campo normal, no interviene. El único campo
 * donde sí toma la ráfaga es uno marcado con `data-lector-codigos` (el de «Escanear»).
 */

import { useEffect, useRef } from "react";

/** Tiempo máximo entre teclas para que sigan siendo la misma ráfaga. */
export const LECTOR_MAX_INTERVALO_MS = 40;
/** Largo mínimo de un código. Menos que esto es alguien pulsando teclas. */
export const LECTOR_LARGO_MINIMO = 3;
/** Teclas con que el lector cierra el código (el sufijo es configurable en el lector). */
export const LECTOR_TERMINADORES = ["Enter", "Tab"] as const;

/** Atributo que marca el campo dedicado «Escanear». */
export const ATRIBUTO_CAMPO_LECTOR = "data-lector-codigos";

export type OpcionesDetector = {
  maxIntervaloMs?: number;
  largoMinimo?: number;
  terminadores?: readonly string[];
};

export type TeclaLeida = {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
};

export type DetectorDeEscaneo = {
  /**
   * Una tecla, con la hora en que llegó. Devuelve el código cuando la tecla cierra una
   * ráfaga de lector; `null` en cualquier otro caso.
   */
  tecla(tecla: TeclaLeida, ahora: number): string | null;
  reiniciar(): void;
};

/**
 * La regla, sin DOM ni reloj: se le dan teclas con su hora y dice cuándo fue un lector.
 *
 * Es un escaneo cuando llega un terminador (Enter/Tab) justo después de una ráfaga de
 * al menos `largoMinimo` caracteres en la que ninguna tecla tardó más de
 * `maxIntervaloMs` en llegar tras la anterior.
 */
export function crearDetectorDeEscaneo(opciones: OpcionesDetector = {}): DetectorDeEscaneo {
  const maxIntervalo = opciones.maxIntervaloMs ?? LECTOR_MAX_INTERVALO_MS;
  const largoMinimo = opciones.largoMinimo ?? LECTOR_LARGO_MINIMO;
  const terminadores = opciones.terminadores ?? LECTOR_TERMINADORES;

  let rafaga = "";
  let ultima = 0;

  const reiniciar = () => {
    rafaga = "";
    ultima = 0;
  };

  return {
    reiniciar,
    tecla(tecla, ahora) {
      if (terminadores.includes(tecla.key)) {
        const codigo = rafaga;
        const aTiempo = ultima > 0 && ahora - ultima <= maxIntervalo;
        reiniciar();
        return aTiempo && codigo.length >= largoMinimo ? codigo : null;
      }

      // Shift, Bloq Mayús y compañía llegan como teclas sueltas en medio de la ráfaga
      // (el lector las «pulsa» para las mayúsculas): ni suman ni la cortan.
      if (tecla.key.length !== 1) return null;
      // Un atajo (Ctrl+V, Alt+…) no es un lector.
      if (tecla.ctrlKey || tecla.altKey || tecla.metaKey) {
        reiniciar();
        return null;
      }

      // Demasiado tiempo desde la tecla anterior: lo de antes lo tecleó una persona.
      if (ultima > 0 && ahora - ultima > maxIntervalo) rafaga = "";
      rafaga += tecla.key;
      ultima = ahora;
      return null;
    },
  };
}

function esEditable(elemento: Element | null): boolean {
  if (!elemento) return false;
  const etiqueta = elemento.tagName;
  if (etiqueta === "TEXTAREA" || etiqueta === "SELECT") return true;
  if (etiqueta === "INPUT") {
    // Casillas, radios y botones no reciben texto: ahí el lector sí puede leer.
    const tipo = (elemento.getAttribute("type") || "text").toLowerCase();
    return !["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"].includes(
      tipo,
    );
  }
  const editable = elemento.getAttribute("contenteditable");
  return editable === "" || editable === "true" || editable === "plaintext-only";
}

function esCampoDelLector(elemento: Element | null): boolean {
  return Boolean(elemento?.closest?.(`[${ATRIBUTO_CAMPO_LECTOR}]`));
}

export type OrigenDeEscaneo = {
  /** `true` si la ráfaga cayó dentro del campo «Escanear» (ahí quedó escrita). */
  enCampo: boolean;
};

export type OpcionesLector = OpcionesDetector & {
  onEscaneo: (codigo: string, origen: OrigenDeEscaneo) => void;
  /** Apágalo mientras hay un diálogo abierto o la pestaña no es la del lector. */
  activo?: boolean;
};

/**
 * Escucha el lector USB en toda la ventana mientras `activo`.
 *
 * - Sin ningún campo enfocado: la ráfaga + Enter dispara `onEscaneo`, y ese Enter no
 *   llega a la página (no «pulsa» el botón que tuviera el foco).
 * - Con el foco en un campo normal: no hace nada. Quien escribe, escribe.
 * - Con el foco en el campo marcado `data-lector-codigos`: toma la ráfaga y evita que
 *   ese Enter envíe el formulario; lo tecleado a mano sigue su camino normal.
 */
export function useLectorDeCodigos(opciones: OpcionesLector): void {
  const { activo = true, maxIntervaloMs, largoMinimo, terminadores } = opciones;
  // Un arreglo nuevo en cada render volvería a suscribir el efecto a media ráfaga (el
  // campo «Escanear» se repinta con cada tecla) y el código se perdería.
  const claveTerminadores = (terminadores ?? LECTOR_TERMINADORES).join("|");
  // El callback cambia en cada render; con la ref no hay que volver a suscribirse.
  const onEscaneoRef = useRef(opciones.onEscaneo);
  onEscaneoRef.current = opciones.onEscaneo;

  useEffect(() => {
    if (!activo || typeof window === "undefined") return;
    const detector = crearDetectorDeEscaneo({
      maxIntervaloMs,
      largoMinimo,
      terminadores: claveTerminadores.split("|"),
    });

    const alTeclear = (e: KeyboardEvent) => {
      // Una tecla sostenida o a medio componer (acentos, IME) nunca es un lector.
      if (e.repeat || e.isComposing) return;
      const destino = e.target instanceof Element ? e.target : null;
      const enCampo = esCampoDelLector(destino);
      if (esEditable(destino) && !enCampo) {
        detector.reiniciar();
        return;
      }

      const codigo = detector.tecla(e, Date.now());
      if (codigo == null) return;
      // El Enter del lector no debe enviar un formulario ni pulsar el botón enfocado.
      e.preventDefault();
      e.stopPropagation();
      onEscaneoRef.current(codigo, { enCampo });
    };

    // En captura: se decide antes de que la página reaccione a ese Enter.
    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
  }, [activo, maxIntervaloMs, largoMinimo, claveTerminadores]);
}
