import { Suspense } from "react";
import shared from "../_shared/public.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import heroStyles from "../../components/PublicPageHero.module.css";
import { fetchPageVisuals, resolvePageMediaUrl } from "@/lib/page-content-api";
import ContactoClient from "./ContactoClient";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";

export const dynamic = "force-dynamic";

export default async function ContactoPage() {
  const visuals = await fetchPageVisuals("page_contacto");
  // Owner override: usar foto real local (no CMS) para evitar el arte verde.
  const heroDesktop = "/fotos/sala-monitoreo-videowall-nexara-1920.webp";
  const heroMobile = "/fotos/sala-monitoreo-videowall-nexara-1200.webp";

  return (
    <main className={`${shared.page} home-main-flush`}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          name: "Contacto | NEXARA",
          url: `${siteBaseUrl()}/contacto`,
          description:
            "Agenda un diagnóstico con NEXARA: CCTV, redes, cómputo y soporte TI.",
          mainEntity: {
            "@type": "Organization",
            name: "NEXARA",
            url: siteBaseUrl(),
            contactPoint: {
              "@type": "ContactPoint",
              contactType: "sales",
              areaServed: "MX",
              availableLanguage: "Spanish",
            },
          },
        }}
      />
      <PublicPageHero
        eyebrow="Contacto"
        title={
          <>
            Hablemos de tu{" "}
            <span className={heroStyles.titleAccent}>proyecto</span>
          </>
        }
        lead="Respuesta humana en horario laboral, normalmente en menos de 24 horas. Cotiza CCTV, redes o soporte en Puebla, CDMX y cobertura nacional."
        imageSrc={heroDesktop}
        imageSrcMobile={heroMobile}
        imageAlt="Sala de monitoreo NEXARA con video wall de CCTV"
      />
      <Suspense fallback={<div className={shared.inner} style={{ padding: 40 }}>Cargando formulario…</div>}>
        <ContactoClient visuals={visuals} />
      </Suspense>
    </main>
  );
}
