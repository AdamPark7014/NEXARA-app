import type { Metadata } from "next";
import shared from "../_shared/public.module.css";
import PublicPageHero from "../../components/PublicPageHero";
import heroStyles from "../../components/PublicPageHero.module.css";
import { fetchPageVisuals, resolvePageMediaUrl } from "@/lib/page-content-api";
import ContactoClient from "./ContactoClient";

export const metadata: Metadata = {
  title: "Contacto | Nexara",
  description:
    "Hablemos de tu proyecto. WhatsApp, teléfono o formulario — respuesta en horario laboral.",
};

export const dynamic = "force-dynamic";

export default async function ContactoPage() {
  const visuals = await fetchPageVisuals("page_contacto");
  const heroDesktop = resolvePageMediaUrl(visuals.heroDesktopUrl);
  const heroMobile = resolvePageMediaUrl(visuals.heroMobileUrl || visuals.heroDesktopUrl);

  return (
    <main className={`${shared.page} home-main-flush`}>
      <PublicPageHero
        eyebrow="Contacto"
        title={
          <>
            Hablemos de tu{" "}
            <span className={heroStyles.titleAccent}>proyecto</span>
          </>
        }
        lead="Respuesta humana en horario laboral, normalmente en menos de 24 horas."
        imageSrc={heroDesktop}
        imageSrcMobile={heroMobile}
        imageAlt={visuals.heroAlt}
      />
      <ContactoClient visuals={visuals} />
    </main>
  );
}
