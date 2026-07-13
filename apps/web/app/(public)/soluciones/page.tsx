import React from "react";
import Image from "next/image";
import Link from "next/link";
import shared from "../_shared/public.module.css";

export const metadata = {
  title: "Soluciones por industria | Nexara",
  description:
    "Soluciones Nexara por vertical: retail, manufactura, hospitalidad, salud, educación y gobierno. Tecnología alineada a operación multi-sede.",
};

export const dynamic = "force-dynamic";

const industrias = [
  {
    slug: "retail",
    title: "Retail",
    problem: "Pérdidas, caídas de red en punta de venta y cámaras que nadie revisa.",
    weDo: "CCTV por sucursal, Wi‑Fi estable, cómputo de piso y soporte remoto/en sitio.",
  },
  {
    slug: "manufactura",
    title: "Manufactura",
    problem: "Planta desconectada, accesos sin control y evidencia débil ante incidentes.",
    weDo: "Redes industriales/office, videovigilancia de perímetro y continuidad de equipos críticos.",
  },
  {
    slug: "hospitalidad",
    title: "Hospitalidad",
    problem: "Huéspedes sin Wi‑Fi, telefonía inestable y seguridad dispersa entre áreas.",
    weDo: "Wi‑Fi de alta densidad, CCTV, control de acceso y operación unificada por propiedad.",
  },
  {
    slug: "salud",
    title: "Salud",
    problem: "Consultorios y clínicas con equipos frágiles y redes que no aguantan carga clínica.",
    weDo: "Infraestructura confiable, respaldo, conectividad segmentada y soporte prioritario.",
  },
  {
    slug: "educacion",
    title: "Educación",
    problem: "Campus con puntos ciegos, laboratorios lentos y soporte saturado al inicio de ciclo.",
    weDo: "Cobertura Wi‑Fi, CCTV, aulas conectadas y mesa de ayuda para el personal técnico.",
  },
  {
    slug: "gobierno",
    title: "Gobierno",
    problem: "Edificios con legado, requisitos de evidencia y ventanas cortas de intervención.",
    weDo: "Modernización por fases: redes, videovigilancia, cómputo y documentación auditable.",
  },
];

export default function SolucionesPage() {
  return (
    <main className={shared.page}>
      <section className={shared.hero}>
        <div className={shared.inner}>
          <div className={shared.heroGrid}>
            <div data-reveal="soft">
              <span className={shared.heroEyebrow}>Soluciones por industria</span>
              <h1 className={shared.heroTitle}>
                Tecnología que <span className={shared.heroTitleAccent}>entiende tu operación</span>
              </h1>
              <p className={shared.heroLead}>
                Multi-sede, uptime y cumplimiento. Armamos la solución con lo que tu vertical
                realmente exige — no con un catálogo genérico.
              </p>
              <div className={shared.heroActions}>
                <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                  Hablar con un especialista <span className={shared.btnArrow}>→</span>
                </Link>
                <Link href="/servicios" className={`${shared.btn} ${shared.btnSecondary}`}>
                  Ver capacidades
                </Link>
              </div>
            </div>
            <div className={shared.heroImage} data-reveal="soft">
              <Image
                src="/images/hero/hero-03.png"
                alt="Técnico Nexara en instalación"
                width={720}
                height={540}
                priority
              />
              <div className={shared.heroImageOverlay} />
            </div>
          </div>
        </div>
      </section>

      <section className={shared.section}>
        <div className={shared.inner}>
          <div className={shared.sectionHead} data-reveal="soft">
            <span className={shared.eyebrow}>Verticales</span>
            <h2 className={shared.sectionTitle}>
              El problema típico y <span className={shared.sectionTitleAccent}>cómo lo resolvemos</span>
            </h2>
            <p className={shared.sectionLead}>
              Cada industria tiene su ritmo. Aquí va lo esencial, sin relleno.
            </p>
          </div>

          <div className={shared.capabilityList} data-reveal-stagger>
            {industrias.map((i, idx) => (
              <Link
                key={i.slug}
                href={`/soluciones/${i.slug}`}
                className={shared.editorialRow}
                data-reveal="up"
              >
                <span className={shared.editorialNum}>0{idx + 1}</span>
                <div className={shared.editorialBody}>
                  <span className={shared.editorialBadge}>{i.title}</span>
                  <h3 className={shared.editorialTitle}>{i.problem}</h3>
                  <p className={shared.editorialText}>{i.weDo}</p>
                </div>
                <span className={shared.editorialCta}>
                  Ver detalle <span aria-hidden>→</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={`${shared.section} ${shared.sectionDivider}`}>
        <div className={shared.inner}>
          <div className={shared.ctaShell} data-reveal="up">
            <h2 className={shared.ctaTitle}>
              ¿Tu vertical no está listada?{" "}
              <span className={shared.sectionTitleAccent}>Cuéntanos el contexto.</span>
            </h2>
            <p className={shared.ctaLead}>
              Atendemos proyectos a la medida cuando hay un sitio real, un riesgo claro y un
              responsable de operación.
            </p>
            <div className={shared.ctaActions}>
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                Solicitar consultoría <span className={shared.btnArrow}>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
