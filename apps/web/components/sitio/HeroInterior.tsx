import s from "./sitio.module.css";
import p from "./paginas.module.css";
import i from "./interior.module.css";
import v from "./vivo.module.css";
import HeroPagina from "./HeroPagina";
import Migas, { type Miga } from "./Migas";

type Props = {
  id: string;
  migas?: Miga[];
  antetitulo: React.ReactNode;
  titulo: React.ReactNode;
  lead: string;
  acciones?: React.ReactNode;
  /** Foto o mapa en un marco ancho bajo el texto. */
  visual?: React.ReactNode;
  /** «foto» llena el marco; «mapa» va centrado sobre el fondo alterno; «libre» trae su propio marco. */
  tipoVisual?: "foto" | "mapa" | "libre";
  /** Títulos de más de ~30 caracteres (servicio × industria, servicio × ciudad) bajan un paso de tamaño. */
  tituloLargo?: boolean;
};

/** Hero de las páginas de detalle: migas, título centrado, dos acciones y un visual ancho montado en el corte. */
export default function HeroInterior({ id, migas, antetitulo, titulo, lead, acciones, visual, tipoVisual = "foto", tituloLargo }: Props) {
  const marco = tipoVisual === "mapa" ? `${i.heroVisual} ${i.heroVisualMapa}` : i.heroVisual;
  return (
    <HeroPagina id={id} className={i.hero} visual={!visual ? undefined : tipoVisual === "libre" ? visual : <div className={marco} data-luz="">
            {visual}
            {tipoVisual === "foto" ? (
              <>
                <span className={v.esquinas} aria-hidden="true" />
                <span className={v.barridoCian} aria-hidden="true" />
              </>
            ) : null}
          </div>}>
      {migas ? <Migas migas={migas} /> : null}
      <p className={s.antetitulo}>{antetitulo}</p>
      <h1 id={id} className={`${p.heroTitulo} ${tituloLargo ? i.tituloLargo : ""}`}>
        {titulo}
      </h1>
      <p className={p.heroLead}>{lead}</p>
      {acciones ? <div className={s.acciones}>{acciones}</div> : null}
    </HeroPagina>
  );
}
