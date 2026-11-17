/**
 * Atajos del lienzo en modo holograma. Solo con foco en el lienzo.
 */

export type AccionTeclado =
  | { tipo: "mover-seleccion"; dx: number; dy: number }
  | { tipo: "desplazar-vista"; dx: number; dy: number }
  | { tipo: "girar-vista"; grados: number }
  | { tipo: "rotar-camara"; grados: number }
  | { tipo: "borrar" }
  | { tipo: "deshacer" }
  | { tipo: "rehacer" }
  | { tipo: "copiar" }
  | { tipo: "pegar" };

export type EntradaTeclado = {
  key: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  focoEnLienzo: boolean;
  haySeleccion: boolean;
};

const PASO_CORTO_M = 0.1;
const PASO_LARGO_M = 1;

export function interpretarTecla(e: EntradaTeclado): AccionTeclado | null {
  if (!e.focoEnLienzo) return null;
  const ctrl = e.ctrl || e.meta;
  const k = e.key;
  if (ctrl && k.toLowerCase() === "z") return { tipo: e.shift ? "rehacer" : "deshacer" };
  if (ctrl && k.toLowerCase() === "y") return { tipo: "rehacer" };
  if (ctrl && k.toLowerCase() === "c") return { tipo: "copiar" };
  if (ctrl && k.toLowerCase() === "v") return { tipo: "pegar" };
  if (ctrl) return null;
  if ((k === "Delete" || k === "Backspace") && e.haySeleccion) return { tipo: "borrar" };
  if (k === "q" || k === "Q") return { tipo: "girar-vista", grados: -15 };
  if (k === "e" || k === "E") return { tipo: "girar-vista", grados: 15 };
  if ((k === "r" || k === "R") && e.haySeleccion) return { tipo: "rotar-camara", grados: 15 };
  const paso = e.shift ? PASO_LARGO_M : PASO_CORTO_M;
  const flecha = k === "ArrowLeft" ? { x: -paso, y: 0 } : k === "ArrowRight" ? { x: paso, y: 0 } : k === "ArrowUp" ? { x: 0, y: -paso } : k === "ArrowDown" ? { x: 0, y: paso } : null;
  if (!flecha) return null;
  if (e.haySeleccion) return { tipo: "mover-seleccion", dx: flecha.x, dy: flecha.y };
  return { tipo: "desplazar-vista", dx: flecha.x, dy: flecha.y };
}

export const LEYENDA_ATAJOS = "Flechas mover · Mayús paso largo · Q/E girar vista · R rotar cámara · Supr quitar · Ctrl+Z/Y · Ctrl+C/V";