import React from "react";
import Link from "next/link";
import shared from "../_shared/public.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import heroStyles from "../../components/PublicPageHero.module.css";

export const metadata = {
  title: "Nexara Ingenieros | División de campo",
  description:
    "División de ingeniería en sitio: instalación, integración y mantenimiento de infraestructura tecnológica.",
};

export const dynamic = "force-dynamic";

const lineas = [
  {
    id: "instalacion",
    title: "Instalación",
    text: "Cableado estructurado, fibra, racks, energía y enfriamiento. Entrega con evidencia y documentación del sitio.",
    points: ["Cableado y fibra", "Racks y energía", "Hand-over documentado"],
  },
  {
    id: "integracion",
    title: "Integración",
    text: "Puesta en marcha, configuración y pruebas. Lo instalado queda operable — no “listo para que alguien más lo configure”.",
    points: ["Configuración", "Pruebas en sitio", "Capacitación básica"],
  },
  {
    id: "mantenimiento",
    title: "Mantenimiento",
    text: "Preventivo y correctivo con SLA. Visitas programadas y respuesta cuando el sitio no puede esperar.",
    points: ["Preventivo", "Correctivo", "SLA acordado"],
  },
];

const credenciales = [
  "Personal con DC3 vigente",
  "Cumplimiento NOM-001-SEDE en instalaciones aplicables",
  "Trabajo con estándares de cableado estructurado (CommScope / Belden)",
  "Experiencia en redes Cisco / Fortinet en campo",
];

export default function NexaraIngenierosPage() {
  return (
    <main className={`${shared.page} home-main-flush`}>
      <PublicPageHero
        eyebrow="Nexara Ingenieros"
        title={
          <>
            Ingeniería de campo con{" "}
            <span className={heroStyles.titleAccent}>responsabilidad</span>
          </>
        }
        lead="La división técnica: diseñamos, instalamos y mantenemos la infraestructura que sostiene tu operación."
        imageSrc="/images/hero/hero-03.png"
        imageAlt="Ingenieros Nexara en sitio"
      />

      <section className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.serviceLayout}>
            <nav className={shared.serviceNav} aria-label="Líneas de ingeniería">
              {lineas.map((l) => (
                <a key={l.id} href={`#${l.id}`} className={shared.serviceNavLink}>
                  {l.title}
                </a>
              ))}
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary} ${shared.serviceNavCta}`}>
                Solicitar visita <span className={shared.btnArrow} aria-hidden>→</span>
              </Link>
            </nav>

            <div className={shared.serviceDetail} data-reveal-stagger>
              {lineas.map((l) => (
                <article key={l.id} id={l.id} className={shared.serviceBlock} data-reveal="up">
                  <h2 className={shared.serviceBlockTitle}>{l.title}</h2>
                  <p className={shared.serviceBlockText}>{l.text}</p>
                  <ul className={shared.servicePoints}>
                    {l.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={`${shared.section} ${shared.sectionDivider}`} data-reveal="up">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Campo</p>
            <h2 className={shared.sectionTitle}>
              Trabajo certificado,{" "}
              <span className={shared.sectionTitleAccent}>entrega formal</span>
            </h2>
            <p className={shared.sectionLead}>
              Acreditaciones vigentes y estándares aplicables — para que la obra no dependa de improvisación.
            </p>
          </header>
          <ul className={shared.bulletList} data-reveal-stagger>
            {credenciales.map((c) => (
              <li key={c} data-reveal="up">
                {c}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={shared.sectionTight} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.ctaBand}>
            <p className={shared.ctaEyebrow}>Levantamiento</p>
            <h2 className={shared.ctaTitle}>¿Listo para arrancar?</h2>
            <p className={shared.ctaLead}>
              Levantamiento sin costo. Plano, alcance y propuesta económica en días hábiles.
            </p>
            <div className={shared.ctaActions}>
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                Agendar levantamiento <span className={shared.btnArrow}>→</span>
              </Link>
              <Link href="/cobertura" className={`${shared.btn} ${shared.btnSecondary}`}>
                Ver cobertura
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
