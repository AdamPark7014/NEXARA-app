"use client";

/**
 * Botones de navegación sobre el lienzo (2D y 3D): acercar, alejar, encuadrar y, en 3D, girar. Lo
 * mismo se hace con la rueda y arrastrando, pero así se ve que se puede.
 */
import styles from "./editor.module.css";

export const ICONO = {
  mas: "M12 5v14M5 12h14",
  menos: "M5 12h14",
  encuadrar: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  girarIzq: "M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4",
  girarDer: "M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4",
} as const;

export type BotonNavegacion = { etiqueta: string; icono: string; accion: () => void };

export default function Navegacion({ botones, lugar }: { botones: readonly BotonNavegacion[]; lugar: "arriba" | "abajo" }) {
  return (
    <div className={`${styles.navegacion} ${lugar === "arriba" ? styles.navegacionArriba : styles.navegacionAbajo}`} role="group" aria-label="Navegación del plano">
      {botones.map((b) => (
        <button key={b.etiqueta} type="button" className={styles.botonNav} aria-label={b.etiqueta} title={b.etiqueta} onClick={b.accion}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={b.icono} />
          </svg>
        </button>
      ))}
    </div>
  );
}
