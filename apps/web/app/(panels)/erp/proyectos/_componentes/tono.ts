import type { Tono } from "@/lib/proyectos-api";
import styles from "../proyectos.module.css";

/** Clase de la etiqueta (punto + texto) para un tono: el color nunca va solo. */
export function claseTono(tono: Tono): string {
  const extra =
    tono === "info"
      ? styles.tonoInfo
      : tono === "ok"
        ? styles.tonoOk
        : tono === "alerta"
          ? styles.tonoAlerta
          : tono === "peligro"
            ? styles.tonoPeligro
            : styles.tonoNeutral;
  return `${styles.badge} ${extra}`;
}
