import React from "react";
import Link from "next/link";
import shared from "../_shared/public.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import EditorialImage from "../../components/EditorialImage";
import heroStyles from "../../components/PublicPageHero.module.css";
import { fetchPageVisuals, resolvePageMediaUrl } from "@/lib/page-content-api";

export const metadata = {
  title: "Soluciones por industria | Nexara",
  description:
    "Soluciones Nexara por vertical: retail, manufactura, hospitalidad, salud, educación y gobierno.",
};

export const dynamic = "force-dynamic";

const industrias = [
  {
    slug: "retail",
    title: "Retail",
    risk: "Multi-sede + merma",
    text: "Aperturas y operaciones con CCTV por sucursal, Wi‑Fi estable y soporte de punta de venta. Mismo estándar en cada tienda, sin reinventar el cableado cada vez.",
  },
  {
    slug: "manufactura",
    title: "Manufactura",
    risk: "Downtime de planta",
    text: "Redes de piso, perímetro y continuidad en equipos críticos. Cuando una caída detiene un turno, el diseño no puede ser “genérico de oficina”.",
  },
  {
    slug: "hospitalidad",
    title: "Hospitalidad",
    risk: "Densidad + reputación",
    text: "Wi‑Fi de alta densidad, CCTV y operación unificada por propiedad. El huésped no distingue “red saturada” de “mal hotel”.",
  },
  {
    slug: "salud",
    title: "Salud",
    risk: "Continuidad clínica",
    text: "Segmentación, respaldos y soporte prioritario. La red y el cómputo tienen que sostener flujos clínicos, no solo el Wi‑Fi de la sala de espera.",
  },
  {
    slug: "educacion",
    title: "Educación",
    risk: "Campus completo",
    text: "Wi‑Fi, CCTV y mesa de ayuda para aulas, labs y edificios administrativos. Cobertura que escala con el período escolar, no con el hotspot improvisado.",
  },
  {
    slug: "gobierno",
    title: "Gobierno",
    risk: "Fases + auditoría",
    text: "Modernización por etapas con documentación auditable. Entregables claros, sin cajas negras técnicas ni alcance que no se pueda defender.",
  },
];

export default async function SolucionesPage() {
  const visuals = await fetchPageVisuals("page_soluciones");
  const mid = visuals.slots[0];
  const heroDesktop = resolvePageMediaUrl(visuals.heroDesktopUrl);
  const heroMobile = resolvePageMediaUrl(visuals.heroMobileUrl || visuals.heroDesktopUrl);

  return (
    <main className={`${shared.page} home-main-flush`}>
      <PublicPageHero
        eyebrow="Soluciones"
        title={
          <>
            Tecnología pensada para{" "}
            <span className={heroStyles.titleAccent}>tu operación</span>
          </>
        }
        lead="Seis verticales. En cada una: el riesgo típico, qué instalamos y cómo lo sostenemos."
        imageSrc={heroDesktop}
        imageSrcMobile={heroMobile}
        imageAlt={visuals.heroAlt}
      />

      <section className={shared.section} data-reveal="up">
        <div className={shared.inner}>
          <header className={shared.sectionHead}>
            <p className={shared.eyebrow}>Verticales</p>
            <h2 className={shared.sectionTitle}>
              Qué falla en tu sector — y <span className={shared.sectionTitleAccent}>cómo lo atacamos</span>
            </h2>
            <p className={shared.sectionLead}>
              Entra al detalle de la industria más cercana a tu sitio. Si no encaja, igual podemos armar el alcance.
            </p>
          </header>
          <div className={shared.industryBoard} data-reveal-stagger>
            {industrias.map((i) => (
              <Link
                key={i.slug}
                href={`/soluciones/${i.slug}`}
                className={shared.industryCell}
                data-reveal="up"
              >
                <span className={shared.industryRisk}>{i.risk}</span>
                <h2 className={shared.industryCellTitle}>{i.title}</h2>
                <p className={shared.industryCellText}>{i.text}</p>
                <span className={shared.industryCellLink}>Ver detalle →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {mid?.desktopUrl ? (
        <div className={shared.sectionImageBandBleed} data-reveal="up">
          <EditorialImage
            desktopUrl={mid.desktopUrl}
            mobileUrl={mid.mobileUrl}
            alt={mid.alt}
            caption={
              mid.caption ||
              "Retail, planta, hospitalidad o campus: el diseño sigue el riesgo, no un kit genérico."
            }
            kicker="Antes de cotizar"
            title={mid.caption ? undefined : "Una imagen del contexto real"}
            layout={mid.layout}
            objectPosition={mid.objectPosition}
            compose="caption-bar"
          />
        </div>
      ) : null}

      <section className={shared.sectionTight} data-reveal="up">
        <div className={shared.inner}>
          <div className={shared.ctaBand}>
            <p className={shared.ctaEyebrow}>Siguiente paso</p>
            <h2 className={shared.ctaTitle}>¿Otra vertical?</h2>
            <p className={shared.ctaLead}>
              Cuéntanos el sitio, el riesgo y la urgencia. Armamos el alcance alrededor de eso — no de un PDF genérico.
            </p>
            <div className={shared.ctaActions}>
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                Hablar con un especialista <span className={shared.btnArrow} aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
