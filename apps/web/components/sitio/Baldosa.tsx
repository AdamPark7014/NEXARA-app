import Link from "next/link";
import type { Foto } from "./fotos";
import b from "./portada.module.css";

type Accion = { href: string; label: string; principal?: boolean; medicion?: string };

type Props = {
  nombre: string;
  texto: string;
  acciones: Accion[];
  /** Foto a sangre; el velo de arriba deja leer el texto. */
  foto?: Foto & { alt: string; posicion?: string };
  /** Mini interfaz al pie cuando la baldosa no lleva foto. */
  arte?: React.ReactNode;
  /** Composición a todo el ancho al pie (la foto de grupo del equipo). */
  pie?: React.ReactNode;
  ancha?: boolean;
  /** Baldosa negra con texto claro, para fotos oscuras; alterna el ritmo del mosaico en los dos temas. */
  oscura?: boolean;
};

/**
 * Baldosa grande de la portada (el patrón de la portada de Apple): nombre, una línea y dos acciones centradas
 * arriba, y la imagen ocupando toda la baldosa.
 */
export default function Baldosa({ nombre, texto, acciones, foto, arte, pie, ancha, oscura }: Props) {
  return (
    <article className={[b.baldosa, ancha ? b.ancha : "", oscura ? b.oscura : ""].filter(Boolean).join(" ")} data-aparecer>
      {foto ? (
        <div className={b.foto}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={foto.src}
            srcSet={foto.srcSet}
            sizes={foto.sizes}
            alt={foto.alt}
            loading="lazy"
            decoding="async"
            style={foto.posicion ? { objectPosition: foto.posicion } : undefined}
          />
        </div>
      ) : null}
      <h3 className={b.nombre}>{nombre}</h3>
      <p className={b.texto}>{texto}</p>
      <div className={b.botones}>
        {acciones.map((a) => (
          <Link key={a.href + a.label} href={a.href} className={a.principal ? b.pildora : b.pildoraHueca} data-track-conversion={a.medicion}>
            {a.label}
          </Link>
        ))}
      </div>
      {arte ? (
        <div className={b.arte} aria-hidden="true">
          {arte}
        </div>
      ) : null}
      {pie ? <div className={b.pie}>{pie}</div> : null}
    </article>
  );
}
