import { Fragment, type CSSProperties } from "react";
import Link from "next/link";
import PublicIcon from "@/app/components/PublicIcon";
import s from "./sitio.module.css";
import e from "./ensamble.module.css";
import Emblema from "./Emblema";
import Escenario from "./Escenario";
import { GUION_ENTRADA } from "./entrada-guion";
import Flecha from "./Flecha";
import { ruta } from "./rutas";
import { HEXAGONO, SENALES } from "./senales";

type Props = {
  /** Renglones del titular. */
  titulo: [string, string];
  texto: string;
  whatsapp: string;
};

/**
 * Hero de la portada. El servidor pinta todo (emblema en vectores, nodos, titular y acciones) y la entrada es CSS;
 * `Escenario` agrega encima el lienzo de circuitos cuando llega JavaScript.
 */
export default function HeroEnsamble({ titulo, texto, whatsapp }: Props) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: GUION_ENTRADA }} />
      <Escenario etiquetadoPor="hero-titulo">
        <div className={e.fondo} aria-hidden="true" />
        <div className={`${s.contenedor} ${e.contenido}`}>
          <button type="button" className={e.emblemaCaja} data-nx-repetir="" aria-label="Repetir la animación de entrada">
            <span className={e.resplandor} aria-hidden="true" />
            <span data-nx-emblema="" style={{ display: "block" }}>
              <Emblema uid="hero" animado />
            </span>
          </button>

          <nav className={e.nodos} aria-label="Servicios">
            <ul className={e.nodosLista}>
              {/* Los cinco servicios como nodos del circuito: cada uno con su señal (un color del logotipo). */}
              {SENALES.map((n, i) => (
                <li key={n.id}>
                  <Link
                    href={ruta(`/servicios#${n.id}`)}
                    className={e.nodo}
                    style={{ "--c": n.color, "--i": i } as CSSProperties}
                    data-nx-nodo=""
                    data-track-conversion={`home_hero_nodo_${n.id}`}
                  >
                    <span className={e.hex} data-nx-hex="">
                      <svg className={e.hexForma} viewBox="0 0 52 56" aria-hidden="true">
                        <path className={e.hexBase} d={HEXAGONO} />
                        <path className={e.hexLuz} d={HEXAGONO} />
                        <path className={e.onda} d={HEXAGONO} />
                      </svg>
                      <PublicIcon name={n.icono} size={22} />
                    </span>
                    <span className={e.nodoNombre}>{n.nombre}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className={e.texto} data-nx-veto="">
            <h1 id="hero-titulo" className={e.titulo}>
              {/* El espacio entre renglones no se ve (cada uno es un bloque), pero separa las frases para quien lee el
                  texto sin estilos: buscadores, vistas previas y lectores. */}
              {titulo.map((renglon, i) => (
                <Fragment key={renglon}>
                  {i ? " " : null}
                  <span className={e.linea}>
                    <span>{renglon}</span>
                  </span>
                </Fragment>
              ))}
            </h1>
            <p className={e.sub}>{texto}</p>
            <div className={e.acciones} data-cede-aviso="">
              <Link href={ruta("/contacto")} className={`${s.boton} ${s.botonPrimario}`} data-track-conversion="home_hero_cta">
                Agendar diagnóstico
                <Flecha />
              </Link>
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className={`${s.boton} ${s.botonSecundario}`}
                data-track-conversion="home_hero_whatsapp"
              >
                Hablar con un especialista
                <Flecha />
              </a>
            </div>
          </div>
        </div>
      </Escenario>
    </>
  );
}
