import Link from "next/link";
import s from "./sitio.module.css";
import p from "./paginas.module.css";
import i from "./interior.module.css";
import Flecha from "./Flecha";
import HeroPagina from "./HeroPagina";
import TarjetasRuta from "./TarjetasRuta";

/**
 * Contenido de «esta página no existe» del sitio público: abre de noche como las demás páginas y deja a la mano las
 * tres salidas más útiles, montadas en el corte. Lo usan los dos not-found.
 */
export default function NoEncontrado() {
  return (
    <main aria-label="Página no encontrada">
      <HeroPagina
        id="no-encontrado"
        visual={
          <div className={i.rutasSalida}>
            <TarjetasRuta
              nivel={2}
              ir="Abrir"
              rutas={[
                { href: "/servicios", titulo: "Servicios", texto: "Videovigilancia, redes, cómputo y soporte.", icono: "layers" },
                { href: "/proyectos", titulo: "Proyectos", texto: "Instalaciones reales en operación.", icono: "camera" },
                { href: "/contacto", titulo: "Contacto", texto: "Cuéntanos qué necesitas.", icono: "phone" },
              ]}
            />
          </div>
        }
      >
        <p className={s.antetitulo}>Error 404</p>
        <h1 id="no-encontrado" className={p.heroTitulo}>
          Esta página no existe.
        </h1>
        <p className={p.heroLead}>Puede que el enlace esté incompleto o que la página se haya movido.</p>
        <div className={s.acciones}>
          <Link href="/" className={`${s.boton} ${s.botonPrimario}`}>
            Ir al inicio
            <Flecha />
          </Link>
        </div>
      </HeroPagina>
    </main>
  );
}
