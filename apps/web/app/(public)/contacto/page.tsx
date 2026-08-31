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
  const heroDesktop = resolvePageMediaUrl(visuals.heroDesktopUrl);
  const heroMobile = resolvePageMediaUrl(visuals.heroMobileUrl || visuals.heroDesktopUrl);

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
        imageAlt={visuals.heroAlt}
      />
      <Suspense fallback={<div className={shared.inner} style={{ padding: 40 }}>Cargando formulario…</div>}>
        <ContactoClient visuals={visuals} />
      </Suspense>
    </main>
  );
}
