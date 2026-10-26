import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { buildStudioPageMetadata } from "@/lib/page-seo";
import { JsonLd, siteBaseUrl } from "@/lib/seo/json-ld";
import s from "@/components/sitio/sitio.module.css";
import p from "@/components/sitio/paginas.module.css";
import Aurora from "@/components/sitio/Aurora";
import Flecha from "@/components/sitio/Flecha";
import FormularioContacto from "@/components/sitio/FormularioContacto";
import Copiar from "@/components/sitio/Copiar";
import Preguntas, { type Pregunta } from "@/components/sitio/Preguntas";
import BrandMap from "@/app/components/BrandMap";
import PublicIcon from "@/app/components/PublicIcon";
import { buildWhatsAppLeadUrl } from "@/lib/seo/money-pages";

export async function generateMetadata(): Promise<Metadata> {
  return buildStudioPageMetadata("contacto");
}

export const dynamic = "force-dynamic";

const MAPA_URL = "https://maps.app.goo.gl/uJBZyNeAApgAri536";

const PREGUNTAS: Pregunta[] = [
  {
    p: "¿Qué pasa después de enviar el formulario?",
    r: "Una persona del equipo lee tu mensaje y te contacta, por lo general en menos de un día hábil, para entender el sitio y agendar el diagnóstico.",
  },
  {
    p: "¿Pueden revisar una instalación que ya tengo?",
    r: "Sí. Damos mantenimiento preventivo y correctivo a instalaciones existentes y te decimos qué conviene conservar y qué reemplazar.",
  },
  {
    p: "¿Puedo visitar sus oficinas?",
    r: "Sí, con cita previa, de lunes a viernes de 9:00 a 18:00, en Santiago Momoxpan, San Pedro Cholula, Puebla.",
  },
  {
    p: "¿Atienden emergencias de soporte?",
    r: "Si ya tienes soporte con nosotros, usa el canal acordado en tu SLA. Si no, escríbenos por WhatsApp y te decimos qué podemos hacer hoy.",
  },
];

export default function PropuestaContacto() {
  const whatsapp = buildWhatsAppLeadUrl({ industryName: "mi empresa", serviceName: "CCTV, redes o soporte TI", path: "/contacto" });

  return (
    <main aria-label="Contacto">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          name: "Contacto | NEXARA",
          url: `${siteBaseUrl()}/contacto`,
          description: "Agenda un diagnóstico con NEXARA: CCTV, redes, cómputo y soporte TI.",
          mainEntity: {
            "@type": "Organization",
            name: "NEXARA",
            url: siteBaseUrl(),
            contactPoint: { "@type": "ContactPoint", contactType: "sales", areaServed: "MX", availableLanguage: "Spanish" },
          },
        }}
      />
      <section className={p.hero} aria-labelledby="contacto-hero" style={{ paddingBottom: "clamp(40px, 5vw, 64px)" }}>
        <Aurora />
        <div className={`${s.contenedor} ${s.centro}`}>
          <p className={s.antetitulo}>Contacto</p>
          <h1 id="contacto-hero" className={p.heroTitulo}>
            Hablemos de <span className={s.degradado}>tu proyecto.</span>
          </h1>
          <p className={p.heroLead}>Te decimos qué instalar, qué posponer y un presupuesto realista. La primera respuesta suele llegar en un día hábil.</p>
        </div>
      </section>

      <section id="formulario" className={s.seccion} aria-label="Formulario y canales" style={{ paddingTop: 0 }}>
        <div className={`${s.contenedor} ${p.contacto}`}>
          <Suspense fallback={<div className={p.formulario} />}>
            <FormularioContacto />
          </Suspense>
          <aside>
            <ul className={p.canales}>
              <li>
                <a className={p.canal} href={whatsapp} target="_blank" rel="noopener noreferrer" data-track-conversion="contacto_whatsapp">
                  <span className={`${p.canalIcono} ${p.canalWhats}`}>
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35zM12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.43 9.88-9.88 9.88zm8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.16-3.48-8.42z" />
                    </svg>
                  </span>
                  <span>
                    <span className={p.canalNombre}>WhatsApp</span>
                    <span className={p.canalValor}>La forma más rápida de escribirnos</span>
                  </span>
                </a>
              </li>
              <li className={p.canalFila}>
                <a className={p.canal} href="tel:+522226960350">
                  <span className={p.canalIcono}>
                    <PublicIcon name="phone" size={20} />
                  </span>
                  <span>
                    <span className={p.canalNombre}>+52 222 696 0350</span>
                    <span className={p.canalValor}>Lunes a viernes, de 9:00 a 18:00</span>
                  </span>
                </a>
                <Copiar valor="+52 222 696 0350" etiqueta="teléfono" />
              </li>
              <li className={p.canalFila}>
                <a className={p.canal} href="mailto:gerencia@nexara.com.mx">
                  <span className={p.canalIcono}>
                    <PublicIcon name="fileCheck" size={20} />
                  </span>
                  <span>
                    <span className={p.canalNombre}>gerencia@nexara.com.mx</span>
                    <span className={p.canalValor}>Para propuestas y documentos</span>
                  </span>
                </a>
                <Copiar valor="gerencia@nexara.com.mx" etiqueta="correo" />
              </li>
            </ul>
            <div className={p.despues}>
              <p className={p.despuesTitulo}>Qué sigue</p>
              <ol className={p.despuesLista}>
                <li>
                  <span>
                    <b>Te contactamos</b>
                    Una persona del equipo, no un bot.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Diagnóstico</b>
                    Recorremos el sitio y levantamos riesgos.
                  </span>
                </li>
                <li>
                  <span>
                    <b>Propuesta con alcance cerrado</b>
                    Qué instalar, qué posponer y cuánto cuesta.
                  </span>
                </li>
              </ol>
            </div>
          </aside>
        </div>
      </section>

      <section id="ubicacion" className={`${s.seccion} ${s.seccionAlt}`} aria-labelledby="ubicacion-titulo">
        <div className={`${s.contenedor} ${p.dos}`}>
          <div data-aparecer>
            <p className={s.antetitulo}>Base de operación</p>
            <h2 id="ubicacion-titulo" className={s.titulo}>
              Puebla y <span className={s.tenue}>Ciudad de México.</span>
            </h2>
            <p className={s.lead}>Operamos desde Santiago Momoxpan, San Pedro Cholula, y atendemos proyectos en la Ciudad de México y el resto del país.</p>
            <dl className={s.datos}>
              <div className={s.dato}>
                <dt className={s.datoEtiqueta}>Dirección</dt>
                <dd className={s.datoValor}>Ignacio Allende 512, Santiago Momoxpan</dd>
              </div>
              <div className={s.dato}>
                <dt className={s.datoEtiqueta}>Visitas</dt>
                <dd className={s.datoValor}>Con cita, lunes a viernes</dd>
              </div>
              <div className={s.dato}>
                <dt className={s.datoEtiqueta}>Cobertura</dt>
                <dd className={s.datoValor}>Todo México</dd>
              </div>
            </dl>
            <div className={s.acciones}>
              <a href={MAPA_URL} target="_blank" rel="noopener noreferrer" className={`${s.boton} ${s.botonPrimario}`}>
                Cómo llegar
                <Flecha />
              </a>
              <Link href="/cobertura/puebla/camaras-cctv" className={s.enlace}>
                Ver cobertura
                <Flecha />
              </Link>
            </div>
          </div>
          <div className={p.mapaCalle} data-aparecer>
            {/* Sin la tarjeta ni el botón propios del mapa: la dirección y «Cómo llegar» ya están a la izquierda. */}
            <BrandMap overlay={false} />
          </div>
        </div>
      </section>

      <section className={s.seccion} aria-labelledby="faq-contacto">
        <div className={`${s.contenedor} ${s.faq}`}>
          <div data-aparecer>
            <p className={s.antetitulo}>Antes de escribir</p>
            <h2 id="faq-contacto" className={s.titulo}>
              Preguntas <span className={s.tenue}>frecuentes.</span>
            </h2>
          </div>
          <div data-aparecer>
            <Preguntas preguntas={PREGUNTAS} />
          </div>
        </div>
      </section>
    </main>
  );
}
