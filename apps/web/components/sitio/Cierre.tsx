import Link from "next/link";
import PublicIcon from "@/app/components/PublicIcon";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";
import s from "./sitio.module.css";
import Aurora from "./Aurora";
import Flecha from "./Flecha";
import { ruta } from "./rutas";

type Props = {
  titulo: React.ReactNode;
  texto: string;
  /** Botón principal; por omisión, agendar diagnóstico en Contacto. */
  primario?: { href: string; label: string };
  /** Página de origen para el mensaje de WhatsApp y la medición. */
  origen: string;
  /** Enlace de WhatsApp con el mensaje propio de la página (industria, servicio o ciudad). */
  whatsapp?: string;
  /**
   * Nombres de medición que ya usa el tablero de landings. El rastreador cuenta como conversión el clic cuyo nombre
   * lleva «primary», así que las landings conservan los suyos (`landing_primary_cta`…).
   */
  medicion?: { primario: string; whatsapp: string; ruta?: string };
};

/** Llamado final de cada página: tarjeta con el degradado de marca, dos acciones y tres garantías. */
export default function Cierre({
  titulo,
  texto,
  primario = { href: "/contacto", label: "Agendar diagnóstico" },
  origen,
  whatsapp,
  medicion,
}: Props) {
  const enlaceWhatsapp =
    whatsapp ?? buildWhatsAppLeadUrl({ industryName: "mi empresa", serviceName: "CCTV, redes o soporte TI", path: origen });
  const clave = origen.replace(/\W+/g, "_").replace(/^_|_$/g, "") || "inicio";
  return (
    <section className={s.final} aria-labelledby={`cierre-${clave}`}>
      <div className={s.contenedor}>
        <div className={s.finalTarjeta} data-aparecer>
          <Aurora />
          <h2 id={`cierre-${clave}`} className={s.titulo}>
            {titulo}
          </h2>
          <p className={s.lead}>{texto}</p>
          <div className={s.acciones}>
            <Link
              href={ruta(primario.href)}
              className={`${s.boton} ${s.botonPrimario}`}
              data-track-conversion={medicion?.primario ?? `${clave}_cierre_cta`}
              data-landing-path={medicion?.ruta}
            >
              {primario.label}
              <Flecha />
            </Link>
            <a
              href={enlaceWhatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={`${s.boton} ${s.botonSecundario}`}
              data-track-conversion={medicion?.whatsapp ?? `${clave}_cierre_whatsapp`}
              data-landing-path={medicion?.ruta}
            >
              Escríbenos por WhatsApp
              <Flecha />
            </a>
          </div>
          <ul className={s.finalGarantias}>
            <li>
              <PublicIcon name="clock" size={18} /> Primera respuesta en un día hábil
            </li>
            <li>
              <PublicIcon name="mapPin" size={18} /> Diagnóstico en sitio
            </li>
            <li>
              <PublicIcon name="fileCheck" size={18} /> Memoria técnica al entregar
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
