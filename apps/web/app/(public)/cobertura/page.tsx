import React from "react";
import Link from "next/link";
import shared from "../_shared/public.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import heroStyles from "../../components/PublicPageHero.module.css";

export const dynamic = "force-dynamic";

const regiones = [
  {
    name: "Centro",
    role: "Base operativa",
    desc: "Puebla, CDMX, Estado de México y Querétaro — cuadrillas propias y tiempos de respuesta locales.",
  },
  {
    name: "Bajío",
    role: "Campo + partners",
    desc: "Guanajuato, Aguascalientes y San Luis Potosí. Levantamiento en sitio y seguimiento remoto.",
  },
  {
    name: "Occidente",
    role: "Campo + partners",
    desc: "Jalisco, Nayarit, Colima y Michoacán. Instalación y mantenimiento con logística coordinada.",
  },
  {
    name: "Norte",
    role: "Cobertura extendida",
    desc: "Nuevo León, Coahuila, Chihuahua y Sonora. Proyectos por fases con equipo móvil.",
  },
  {
    name: "Sureste",
    role: "Cobertura extendida",
    desc: "Yucatán, Quintana Roo, Veracruz y Tabasco. Intervenciones programadas y soporte híbrido.",
  },
  {
    name: "Pacífico",
    role: "Cobertura extendida",
    desc: "Sinaloa y Baja California. Enlaces, CCTV y redes con ventanas de trabajo claras.",
  },
];

const modalidades = [
  {
    title: "En sitio",
    text: "Cuadrillas con kit completo, EPP y permisos. Ideal para instalaciones, cableado y entregas con evidencia.",
  },
  {
    title: "Remoto",
    text: "Diagnóstico, configuración y mesa de ayuda sin desplazar personal. Primera línea para la mayoría de incidentes.",
  },
  {
    title: "Híbrido",
    text: "Remoto primero; visita cuando el riesgo o el SLA lo piden. El modelo se define en el contrato, no al calor del ticket.",
  },
];

export default function CoberturaPage() {
  return (
    <main className={`${shared.page} home-main-flush`}>
      <PublicPageHero
        eyebrow="Cobertura"
        title={
          <>
            Base en el centro,{" "}
            <span className={heroStyles.titleAccent}>alcance nacional</span>
          </>
        }
        lead="Puebla y CDMX como ancla operativa. El resto del país con campo propio, partners y modelo remoto o híbrido."
        imageSrc="/images/hero/hero-06.png"
        imageAlt="Cobertura nacional Nexara"
      />

      <section className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Regiones</p>
            <h2 className={shared.sectionTitle}>
              Dónde llegamos — y <span className={shared.sectionTitleAccent}>cómo</span>
            </h2>
            <p className={shared.sectionLead}>
              Seis regiones. La base centra el personal; el resto se arma según urgencia, sitio y SLA.
            </p>
          </header>
          <div className={shared.industryBoard} data-reveal-stagger>
            {regiones.map((r) => (
              <div key={r.name} className={shared.industryCell} data-reveal="up">
                <span className={shared.industryRisk}>{r.role}</span>
                <h3 className={shared.industryCellTitle}>{r.name}</h3>
                <p className={shared.industryCellText}>{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${shared.section} ${shared.sectionDivider}`} data-reveal="up">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Modalidades</p>
            <h2 className={shared.sectionTitle}>
              Cómo <span className={shared.sectionTitleAccent}>intervenimos</span>
            </h2>
            <p className={shared.sectionLead}>
              El modelo se adapta al riesgo y a la ventana de trabajo — no al contrario.
            </p>
          </header>
          <div className={shared.principleGrid} data-reveal-stagger>
            {modalidades.map((m) => (
              <div key={m.title} className={shared.principleItem} data-reveal="up">
                <h3 className={shared.principleTitle}>{m.title}</h3>
                <p className={shared.principleText}>{m.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={shared.sectionTight} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.ctaBand}>
            <p className={shared.ctaEyebrow}>Tu zona</p>
            <h2 className={shared.ctaTitle}>¿Operas fuera del centro?</h2>
            <p className={shared.ctaLead}>
              Indica ciudad, tipo de intervención y urgencia. Te confirmamos tiempo de respuesta y modelo de servicio.
            </p>
            <div className={shared.ctaActions}>
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                Consultar mi zona <span className={shared.btnArrow}>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
