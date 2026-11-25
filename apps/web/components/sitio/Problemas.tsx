"use client";

import { useState, type CSSProperties } from "react";
import PublicIcon from "@/app/components/PublicIcon";
import { SENALES } from "./senales";
import p from "./paginas.module.css";
import v from "./vivo.module.css";

export type Problema = { titulo: string; texto: string; solucion: string };

/** Cuatro fallas típicas que se voltean para enseñar cómo quedan: una por una, o todas con el interruptor. */
export default function Problemas({ problemas }: { problemas: Problema[] }) {
  const [vueltas, setVueltas] = useState<boolean[]>(() => problemas.map(() => false));
  const todas = vueltas.every(Boolean);
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={todas}
        aria-label="Ver cómo quedan con NEXARA"
        className={v.interruptor}
        onClick={() => setVueltas(problemas.map(() => !todas))}
      >
        <span>Hoy</span>
        <i aria-hidden="true" />
        <span>Con NEXARA</span>
      </button>
      <ul className={p.problemas}>
        {problemas.map((pr, i) => (
          <li
            key={pr.titulo}
            className={v.volteo}
            data-vuelta={vueltas[i] ? "" : undefined}
            style={{ "--c": SENALES[i % 5].color, "--i": i } as CSSProperties}
          >
            <div className={v.volteoCuerpo}>
              <div className={`${p.problema} ${v.cara}`} aria-hidden={vueltas[i]} data-luz="">
                <span className={p.problemaEtiqueta}>
                  <PublicIcon name="alert" size={16} /> Lo que suele fallar
                </span>
                <h3 className={p.problemaTitulo}>{pr.titulo}</h3>
                <p className={p.problemaTexto}>{pr.texto}</p>
              </div>
              <div className={`${p.problema} ${v.cara} ${v.caraAtras}`} aria-hidden={!vueltas[i]}>
                <span className={v.caraEtiqueta}>
                  <PublicIcon name="check" size={16} /> Con NEXARA
                </span>
                <p className={v.caraSolucion}>{pr.solucion}</p>
              </div>
            </div>
            <button
              type="button"
              className={v.volteoBoton}
              aria-pressed={vueltas[i]}
              aria-label={`Cómo se resuelve: ${pr.titulo}`}
              onClick={() => setVueltas((a) => a.map((x, n) => (n === i ? !x : x)))}
            >
              {vueltas[i] ? "Ver la falla" : "Ver cómo se resuelve"}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
