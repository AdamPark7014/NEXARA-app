import Link from "next/link";
import PublicIcon from "@/app/components/PublicIcon";
import s from "@/components/sitio/sitio.module.css";
import i from "@/components/sitio/interior.module.css";
import Rutas from "@/components/sitio/TarjetasRuta";

/** Página no encontrada dentro del sitio (una solución, ciudad o nota que ya no existe): con el encabezado y salidas útiles. */
export default function SitioNoEncontrado() {
  return (
    <main className={i.servicioPagina} aria-label="Página no encontrada">
      <div style={{ width: "min(1040px, 100%)" }}>
        <div className={`${i.panel} ${i.panelAngosto}`} style={{ marginInline: "auto" }}>
          <span className={i.panelIcono}>
            <PublicIcon name="search" size={24} />
          </span>
          <h1 className={i.panelTitulo}>Esta página no existe</h1>
          <p className={i.panelTexto}>Puede que el enlace esté incompleto o que la página se haya movido.</p>
          <div className={i.panelAcciones}>
            <Link href="/" className={`${s.boton} ${s.botonPrimario}`}>
              Ir al inicio
            </Link>
          </div>
        </div>
        <Rutas
          ir="Abrir"
          rutas={[
            { href: "/servicios", titulo: "Servicios", texto: "Videovigilancia, redes, cómputo y soporte.", icono: "layers" },
            { href: "/proyectos", titulo: "Proyectos", texto: "Instalaciones reales en operación.", icono: "camera" },
            { href: "/contacto", titulo: "Contacto", texto: "Cuéntanos qué necesitas.", icono: "phone" },
          ]}
        />
      </div>
    </main>
  );
}
