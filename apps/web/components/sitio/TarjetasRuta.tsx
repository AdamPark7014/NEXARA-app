import type { CSSProperties } from "react";
import Link from "next/link";
import PublicIcon, { type PublicIconName } from "@/app/components/PublicIcon";
import i from "./interior.module.css";
import { SENALES } from "./senales";
import Flecha from "./Flecha";

export type Ruta = {
  href: string;
  titulo: string;
  texto?: string;
  etiqueta?: string;
  icono?: PublicIconName;
};

type Props = {
  rutas: Ruta[];
  ir?: string;
  columnas?: 3 | 4;
  /** Nivel del título de cada tarjeta: 3 bajo el `h2` de una sección; 2 cuando cuelgan directo del `h1` (el 404). */
  nivel?: 2 | 3;
};

/** Rejilla de tarjetas que llevan a otra página (soluciones, servicios por ciudad, industrias). */
export default function Rutas({ rutas, ir = "Ver detalle", columnas = 3, nivel = 3 }: Props) {
  const Titulo = nivel === 2 ? "h2" : "h3";
  return (
    <ul className={`${i.rutas} ${columnas === 4 ? i.rutasCuatro : ""}`}>
      {rutas.map((r, n) => (
        <li key={r.href} data-aparecer style={{ "--c": SENALES[n % 5].color } as CSSProperties}>
          <Link href={r.href} className={i.ruta} data-flecha data-luz="">
            {r.icono ? (
              <span className={i.rutaIcono}>
                <PublicIcon name={r.icono} size={20} />
              </span>
            ) : null}
            {r.etiqueta ? <span className={i.rutaEtiqueta}>{r.etiqueta}</span> : null}
            <Titulo className={i.rutaTitulo}>{r.titulo}</Titulo>
            {r.texto ? <p className={i.rutaTexto}>{r.texto}</p> : null}
            <span className={i.rutaIr}>
              {ir}
              <Flecha />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
