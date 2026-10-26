import Link from "next/link";
import PublicIcon from "@/app/components/PublicIcon";
import s from "@/components/sitio/sitio.module.css";
import p from "@/components/sitio/paginas.module.css";
import i from "@/components/sitio/interior.module.css";
import HeroInterior from "@/components/sitio/HeroInterior";
import Cierre from "@/components/sitio/Cierre";
import Flecha from "@/components/sitio/Flecha";
import { foto } from "@/components/sitio/fotos";

export const metadata = {
  title: { absolute: "NEXARA Ingenieros: división de campo | NEXARA" },
  description:
    "División de ingeniería en sitio: instalación, integración y mantenimiento de infraestructura tecnológica.",
};

export const dynamic = "force-dynamic";

const LINEAS = [
  {
    titulo: "Instalación",
    texto: "Cableado estructurado, fibra, racks, energía y enfriamiento, con evidencia y documentación del sitio.",
    puntos: ["Cableado y fibra", "Racks y energía", "Entrega documentada"],
  },
  {
    titulo: "Integración",
    texto: "Puesta en marcha, configuración y pruebas. Lo instalado queda operando, no «listo para que alguien más lo configure».",
    puntos: ["Configuración", "Pruebas en sitio", "Capacitación básica"],
  },
  {
    titulo: "Mantenimiento",
    texto: "Preventivo y correctivo con SLA: visitas programadas y respuesta cuando el sitio no puede esperar.",
    puntos: ["Preventivo", "Correctivo", "SLA acordado"],
  },
];

const CREDENCIALES = [
  "Personal con DC-3 vigente",
  "Cumplimiento de la NOM-001-SEDE en las instalaciones que aplica",
  "Cableado estructurado con estándares CommScope y Belden",
  "Experiencia en campo con redes Cisco y Fortinet",
];

export default function NexaraIngenierosPage() {
  return (
    <main aria-label="NEXARA Ingenieros">
      <HeroInterior
        id="ingenieros-titulo"
        antetitulo="NEXARA Ingenieros"
        titulo={
          <>
            Ingeniería de campo <span className={s.tenue}>con responsabilidad.</span>
          </>
        }
        lead="La división técnica: diseñamos, instalamos y mantenemos la infraestructura que sostiene tu operación."
        acciones={
          <Link href="/contacto" className={`${s.boton} ${s.botonPrimario}`} data-track-conversion="ingenieros_hero_cta">
            Solicitar visita
            <Flecha />
          </Link>
        }
        visual={
          // eslint-disable-next-line @next/next/no-img-element
          <img
            {...foto("equipo-tecnico-nexara-uniforme", "(max-width: 1260px) 100vw, 1200px")}
            alt="Técnicos de NEXARA con uniforme en un sitio de trabajo"
            fetchPriority="high"
            decoding="async"
            style={{ objectPosition: "center 30%" }}
          />
        }
      />

      <section className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="lineas-titulo">
        <div className={s.contenedor}>
          <div data-aparecer>
            <p className={s.antetitulo}>Líneas de trabajo</p>
            <h2 id="lineas-titulo" className={s.titulo}>
              De la obra <span className={s.tenue}>a la operación.</span>
            </h2>
          </div>
          <ol className={p.tres}>
            {LINEAS.map((l, n) => (
              <li key={l.titulo} className={p.tresItem} data-aparecer>
                <span className={p.tresNumero}>{String(n + 1).padStart(2, "0")}</span>
                <h3 className={p.tresTitulo}>{l.titulo}</h3>
                <p className={p.tresTexto}>{l.texto}</p>
                <ul className={p.lista}>
                  {l.puntos.map((pt) => (
                    <li key={pt}>
                      <PublicIcon name="check" size={18} />
                      {pt}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={s.seccion} aria-labelledby="credenciales-titulo">
        <div className={`${s.contenedor} ${i.dos}`}>
          <div data-aparecer>
            <p className={s.antetitulo}>Campo</p>
            <h2 id="credenciales-titulo" className={s.titulo}>
              Trabajo certificado, <span className={s.tenue}>entrega formal.</span>
            </h2>
            <p className={s.lead}>Acreditaciones vigentes y estándares aplicables, para que la obra no dependa de la improvisación.</p>
          </div>
          <div className={i.tarjeta} data-aparecer>
            <span className={i.tarjetaEtiqueta}>
              <PublicIcon name="fileCheck" size={16} /> Credenciales
            </span>
            <ul className={p.lista}>
              {CREDENCIALES.map((c) => (
                <li key={c}>
                  <PublicIcon name="check" size={18} />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <Cierre
        titulo={
          <>
            ¿Listo para arrancar? <span className={s.tenue}>Agenda el levantamiento.</span>
          </>
        }
        texto="Levantamiento sin costo: plano, alcance y propuesta económica en días hábiles."
        primario={{ href: "/contacto", label: "Agendar levantamiento" }}
        origen="/Nexara-Ingenieros"
      />
    </main>
  );
}
