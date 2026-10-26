import Link from "next/link";
import PublicIcon, { type PublicIconName } from "@/app/components/PublicIcon";
import i from "./interior.module.css";
import Flecha from "./Flecha";

export type Ruta = {
  href: string;
  titulo: string;
  texto?: string;
  etiqueta?: string;
  icono?: PublicIconName;
};

/** Rejilla de tarjetas que llevan a otra página (soluciones, servicios por ciudad, industrias). */
export default function Rutas({ rutas, ir = "Ver detalle", columnas = 3 }: { rutas: Ruta[]; ir?: string; columnas?: 3 | 4 }) {
  return (
    <ul className={`${i.rutas} ${columnas === 4 ? i.rutasCuatro : ""}`}>
      {rutas.map((r) => (
        <li key={r.href} data-aparecer>
          <Link href={r.href} className={i.ruta} data-flecha>
            {r.icono ? (
              <span className={i.rutaIcono}>
                <PublicIcon name={r.icono} size={20} />
              </span>
            ) : null}
            {r.etiqueta ? <span className={i.rutaEtiqueta}>{r.etiqueta}</span> : null}
            <h3 className={i.rutaTitulo}>{r.titulo}</h3>
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
