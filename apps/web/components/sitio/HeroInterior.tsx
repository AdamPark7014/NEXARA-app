import s from "./sitio.module.css";
import p from "./paginas.module.css";
import i from "./interior.module.css";
import Aurora from "./Aurora";
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
  /** «foto» llena el marco; «mapa» va centrado sobre el fondo alterno. */
  tipoVisual?: "foto" | "mapa";
  /** Títulos de más de ~30 caracteres (servicio × industria, servicio × ciudad) bajan un paso de tamaño. */
  tituloLargo?: boolean;
};

/** Hero de las páginas de detalle: migas, título centrado, dos acciones y un visual ancho. */
export default function HeroInterior({ id, migas, antetitulo, titulo, lead, acciones, visual, tipoVisual = "foto", tituloLargo }: Props) {
  const marco = tipoVisual === "mapa" ? `${i.heroVisual} ${i.heroVisualMapa}` : i.heroVisual;
  return (
    <section className={`${p.hero} ${i.hero}`} aria-labelledby={id}>
      <Aurora />
      <div className={`${s.contenedor} ${s.centro}`}>
        {migas ? <Migas migas={migas} /> : null}
        <p className={s.antetitulo}>{antetitulo}</p>
        <h1 id={id} className={`${p.heroTitulo} ${tituloLargo ? i.tituloLargo : ""}`}>
          {titulo}
        </h1>
        <p className={p.heroLead}>{lead}</p>
        {acciones ? <div className={s.acciones}>{acciones}</div> : null}
        {visual ? <div className={marco}>{visual}</div> : null}
      </div>
    </section>
  );
}
