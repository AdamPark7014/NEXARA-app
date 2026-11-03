"use client";

import { ButtonLink } from "@/components/base";
import { DashPanel } from "@/components/dashboard/DashKit";
import { pasosDeLaCadena, siguientePasoDelNegocio, type CadenaNegocio as Cadena } from "@/lib/hoy-cadena";
import styles from "./CadenaNegocio.module.css";

/**
 * De la cotización al cobro, en una tira. Antes aquí había cuatro cuadros en $0 que no decían por qué:
 * esto enseña en qué eslabón se detiene el negocio (Mapa de Core, Bloque B).
 */
export default function CadenaNegocio({ cadena, faltanCifras }: { cadena: Cadena; faltanCifras: boolean }) {
  return (
    <DashPanel title="Cómo va el negocio" subtitle="De la cotización al cobro" flush>
      <ol className={styles.pasos}>
        {pasosDeLaCadena(cadena).map((p) => (
          <li key={p.id} className={styles.paso} data-estado={p.estado} aria-current={p.estado === "aqui" ? "step" : undefined}>
            <span className={styles.etiqueta}>{p.etiqueta}</span>
            <b className={styles.valor}>{p.valor}</b>
            <span className={styles.nota}>{p.nota}</span>
          </li>
        ))}
      </ol>
      {faltanCifras ? (
        <p className={styles.pie}>Ingresos, oportunidades, bancos y por cobrar aparecen aquí con su primer dato.</p>
      ) : null}
    </DashPanel>
  );
}

export function SiguientePasoNegocio({ cadena }: { cadena: Cadena }) {
  const paso = siguientePasoDelNegocio(cadena);
  if (!paso) return null;
  return (
    <section className={styles.franja} aria-label="Siguiente paso">
      <div className={styles.franjaTexto}>
        <strong>{paso.titulo}</strong>
        <span>{paso.texto}</span>
      </div>
      <ButtonLink variant="primary" href={paso.accion.href}>
        {paso.accion.etiqueta}
      </ButtonLink>
    </section>
  );
}
