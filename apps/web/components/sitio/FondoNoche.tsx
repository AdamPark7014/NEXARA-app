import Trazas from "./Trazas";
import n from "./noche.module.css";

type Props = {
  /** Dónde va el hilo de color: abajo cierra un escenario, arriba abre el cierre de la página. */
  hilo?: "arriba" | "abajo" | "ninguno";
  /** La luz va arriba (escenario de página) o detrás del titular (cierre). */
  luz?: "arriba" | "centro";
};

/** Fondo de las secciones de noche fuera de la portada: luz azul, rejilla hexagonal y pistas de circuito a los lados. */
export default function FondoNoche({ hilo = "abajo", luz = "arriba" }: Props) {
  const clases = [n.fondo, luz === "centro" ? n.fondoCentro : "", hilo === "arriba" ? n.hiloArriba : hilo === "abajo" ? n.hiloAbajo : ""];
  return (
    <div className={clases.filter(Boolean).join(" ")} aria-hidden="true">
      <i className={n.foco} />
      <Trazas lado="izq" />
      <Trazas lado="der" />
    </div>
  );
}
