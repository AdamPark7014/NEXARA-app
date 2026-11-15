"use client";

/** Tarjetas de la bandeja única: una por tipo de pendiente, con su botón para resolverlo (15-11). */
import Link from "next/link";
import { useEffect, useState } from "react";
import { cargarBandeja, type GrupoBandeja } from "@/lib/bandeja";
import s from "./BandejaUnica.module.css";

export default function BandejaUnica({
  token,
  onGrupos,
  recarga = 0,
}: {
  token: string;
  onGrupos?: (grupos: GrupoBandeja[] | null) => void;
  recarga?: number;
}) {
  const [grupos, setGrupos] = useState<GrupoBandeja[] | null>(null);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    cargarBandeja(token).then((g) => {
      if (!vivo) return;
      // Las firmas de flujo ya se listan abajo con sus botones: aquí no se repiten.
      const sinFirmas = g.filter((x) => x.clave !== "firmas");
      setGrupos(sinFirmas);
      onGrupos?.(sinFirmas);
    });
    return () => {
      vivo = false;
    };
  }, [token, recarga]); // eslint-disable-line react-hooks/exhaustive-deps

  if (grupos === null) {
    return (
      <div className={s.rejilla} aria-busy="true" aria-label="Juntando lo que espera tu firma">
        <div className={s.esqueleto} />
        <div className={s.esqueleto} />
      </div>
    );
  }
  if (!grupos.length) return null;

  return (
    <section className={s.rejilla} aria-label="Lo que espera tu firma">
      {grupos.map((g) => (
        <article key={g.clave} className={s.tarjeta} data-clave={g.clave}>
          <header className={s.cabeza}>
            <span className={s.cantidad}>{g.cantidad}</span>
            <h3 className={s.titulo}>{g.titulo}</h3>
          </header>
          <p className={s.resumen}>{g.resumen}</p>
          {g.ejemplos.length ? (
            <ul className={s.ejemplos}>
              {g.ejemplos.map((e, i) => (
                <li key={i}>
                  <span>{e.titulo}</span>
                  {e.detalle ? <small>{e.detalle}</small> : null}
                </li>
              ))}
            </ul>
          ) : null}
          <Link href={g.href} className={s.boton}>
            {g.accion} →
          </Link>
        </article>
      ))}
    </section>
  );
}
