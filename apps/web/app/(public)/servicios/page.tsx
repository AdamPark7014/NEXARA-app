import React from "react";
import Link from "next/link";
import shared from "../_shared/public.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import heroStyles from "../../components/PublicPageHero.module.css";

export const metadata = {
  title: "Servicios | Nexara — CCTV, redes, cómputo y soporte",
  description:
    "Capacidades Nexara: videovigilancia, redes empresariales, cómputo, soporte TI y plataformas a medida.",
};

export const dynamic = "force-dynamic";

const servicios = [
  {
    id: "cctv",
    title: "Seguridad inteligente",
    text: "Levantamos cobertura real del sitio, instalamos IP + NVR/VMS y dejamos acceso remoto operable. El mantenimiento incluye evidencia — no solo un ticket cerrado.",
    points: ["Diseño de cobertura", "Cámaras IP + NVR/VMS", "Acceso remoto", "Mantenimiento con evidencia"],
  },
  {
    id: "redes",
    title: "Conectividad",
    text: "Cableado, switching y Wi‑Fi empresarial para una o varias sedes. Documentamos el enlace para que no dependas de “el que instaló” cuando algo falle.",
    points: ["Cableado estructurado", "Switching y VLANs", "Wi‑Fi empresarial", "Enlaces y documentación"],
  },
  {
    id: "computo",
    title: "Infraestructura",
    text: "Estaciones, servidores, racks y respaldos con imagen estándar. Menos improvisación en el mostrador y más continuidad cuando un equipo deja de servir.",
    points: ["Estaciones y servidores", "Racks y energía", "Respaldos", "Imagen / estándar de sitio"],
  },
  {
    id: "soporte",
    title: "Soporte TI",
    text: "Mesa de ayuda humana: remoto primero, visita cuando haga falta. Tiempos de respuesta acordados para que el negocio sepa a qué atenerse.",
    points: ["Mesa de ayuda", "Soporte remoto", "Visitas en sitio", "SLA acordado"],
  },
  {
    id: "software",
    title: "Plataformas a medida",
    text: "Portales e integraciones acotados al flujo real. Alcance por fases — sin proyectos eternamente abiertos ni alcance que crece cada semana.",
    points: ["Portales internos", "Integraciones", "Entrega por fases", "Alcance cerrado"],
  },
];

export default function ServiciosPage() {
  return (
    <main className={`${shared.page} home-main-flush`}>
      <PublicPageHero
        eyebrow="Servicios"
        title={
          <>
            Capacidades con{" "}
            <span className={heroStyles.titleAccent}>entrega concreta</span>
          </>
        }
        lead="CCTV, redes, cómputo, soporte y software — instalados con criterio de campo y acompañados después del go-live."
        imageSrc="/images/hero/hero-08.png"
        imageAlt="Centro de monitoreo Nexara"
      />

      <section className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.serviceLayout}>
            <nav className={shared.serviceNav} aria-label="Índice de servicios">
              {servicios.map((s) => (
                <a key={s.id} href={`#${s.id}`} className={shared.serviceNavLink}>
                  {s.title}
                </a>
              ))}
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary} ${shared.serviceNavCta}`}>
                Cotizar proyecto <span className={shared.btnArrow} aria-hidden>→</span>
              </Link>
            </nav>

            <div className={shared.serviceDetail} data-reveal-stagger>
              {servicios.map((s) => (
                <article key={s.id} id={s.id} className={shared.serviceBlock} data-reveal="up">
                  <h2 className={shared.serviceBlockTitle}>{s.title}</h2>
                  <p className={shared.serviceBlockText}>{s.text}</p>
                  <ul className={shared.servicePoints}>
                    {s.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
