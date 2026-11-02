"use client";

import { Button } from "@/components/base";
import type { LecturaAviso, ParteAviso } from "@/lib/aviso-costo-ct";
import s from "./AvisoCosto.module.css";

const TONO = { rojo: s.rojo, ambar: s.ambar, azul: s.azul, verde: s.verde };

function Renglon({ partes }: { partes: ParteAviso[] }) {
  return (
    <div className={s.renglon}>
      {partes.map((p, i) => (
        <span key={p.texto} className={s.parte}>
          {i > 0 ? <span className={s.sep}>{" · "}</span> : null}
          {p.texto}
          {p.cifra ? (
            <>
              {" "}
              <strong className={s.cifra}>{p.cifra}</strong>
            </>
          ) : null}
        </span>
      ))}
    </div>
  );
}

/** «Hoy en CT $X»: lo que cuesta hoy lo ya cotizado y lo que se gana a este precio. Nada cambia sin un clic. */
export default function AvisoCosto({
  lectura,
  onUsar,
  onSubir,
  onDeshacer,
}: {
  lectura: LecturaAviso;
  onUsar: () => void;
  onSubir: () => void;
  onDeshacer: () => void;
}) {
  const hayAcciones = lectura.usar || lectura.subir || lectura.deshacer;
  return (
    <div className={`${s.aviso} ${TONO[lectura.tono]}`} role="status" data-tono={lectura.tono}>
      {lectura.renglones.map((partes) => (
        <Renglon key={partes[0]!.texto} partes={partes} />
      ))}
      {hayAcciones ? (
        <div className={s.acciones}>
          {lectura.usar ? (
            <Button size="sm" variant="secondary" className={s.boton} onClick={onUsar}>
              {lectura.usar}
            </Button>
          ) : null}
          {lectura.subir ? (
            <Button size="sm" variant="secondary" className={s.boton} onClick={onSubir}>
              {lectura.subir.texto}
            </Button>
          ) : null}
          {lectura.deshacer ? (
            <button type="button" className={s.deshacer} onClick={onDeshacer}>
              Deshacer
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
