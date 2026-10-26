import Link from "next/link";
import type { Metadata } from "next";
import { JsonLd } from "@/lib/seo/json-ld";
import s from "@/components/sitio/sitio.module.css";
import i from "@/components/sitio/interior.module.css";
import HeroInterior from "@/components/sitio/HeroInterior";
import Preguntas, { type Pregunta } from "@/components/sitio/Preguntas";
import Directorio from "@/components/sitio/Directorio";
import Cierre from "@/components/sitio/Cierre";
import Flecha from "@/components/sitio/Flecha";

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");

const TITULO = "Preguntas frecuentes de tecnología empresarial | NEXARA";
const DESCRIPCION =
  "Respuestas claras sobre videovigilancia, redes, soporte TI, garantías, tiempos de entrega y cómo se arma una cotización con NEXARA.";

export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRIPCION,
  keywords: [
    "preguntas frecuentes CCTV",
    "FAQ tecnología empresarial",
    "soporte TI empresas",
    "cotizar videovigilancia",
    "Nexara",
  ],
  alternates: { canonical: "/qa" },
  openGraph: {
    type: "website",
    url: `${siteUrl}/qa`,
    title: TITULO,
    description: DESCRIPCION,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Preguntas frecuentes NEXARA" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO,
    description: DESCRIPCION,
    images: ["/opengraph-image"],
  },
};

/** Preguntas por tema; cada respuesta dice una cosa y no repite lo que ya dice otra. */
const TEMAS: { tema: string; preguntas: Pregunta[] }[] = [
  {
    tema: "Antes de contratar",
    preguntas: [
      {
        p: "¿Qué servicios ofrecen?",
        r: "Videovigilancia y control de acceso, redes y cableado estructurado, Wi‑Fi empresarial, equipo de cómputo y servidores, soporte y mesa de ayuda con SLA, y plataformas a la medida: portales, automatización y tableros. También integramos energía, centros de datos y ciberseguridad.",
      },
      {
        p: "¿Cuál es la mejor solución para mi empresa?",
        r: "Depende del riesgo y de cómo opera tu sitio. Empezamos con un diagnóstico en sitio y te decimos qué instalar, qué posponer y qué presupuesto tiene sentido.",
      },
      {
        p: "¿Por qué elegir a NEXARA?",
        r: "Más de diez años en campo, un solo responsable del diagnóstico al soporte y cada entrega documentada con evidencia. Si algo falla, sabes a quién llamar.",
      },
      {
        p: "¿Trabajan con gobierno y con empresas?",
        r: "Sí. Atendemos al sector privado y al gubernamental, con cumplimiento documental y los procesos formales de compra que cada uno pide.",
      },
    ],
  },
  {
    tema: "Cotización y entrega",
    preguntas: [
      {
        p: "¿Cómo solicito una cotización?",
        r: "Con el formulario de contacto, por WhatsApp o por correo. Cuéntanos el sitio y lo que necesitas; te respondemos con una propuesta por fases y alcance cerrado.",
      },
      {
        p: "¿Cuál es el tiempo de entrega?",
        r: "Depende del equipo y del proyecto. El equipo estándar suele estar disponible de inmediato; los proyectos de integración se calendarizan según el alcance.",
      },
      {
        p: "¿Hacen envíos fuera de Puebla y CDMX?",
        r: "Sí, enviamos equipo a toda la República y programamos la instalación según la ciudad y la urgencia.",
      },
    ],
  },
  {
    tema: "Soporte y garantías",
    preguntas: [
      {
        p: "¿Tienen soporte después de la venta?",
        r: "Sí: mantenimiento preventivo y correctivo, soporte técnico para empresas con varias sucursales y capacitación cuando se requiere.",
      },
      {
        p: "¿Ofrecen garantías?",
        r: "Respetamos la garantía de cada fabricante y gestionamos el RMA cuando aplica, para que no tengas que tratar tú con la marca.",
      },
      {
        p: "¿Qué marcas manejan?",
        r: "Trabajamos con fabricantes reconocidos a nivel mundial y elegimos la marca según el proyecto. Algunas aparecen en la portada y en Servicios.",
      },
    ],
  },
];

export default function QAPage() {
  return (
    <main aria-label="Preguntas frecuentes">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: TEMAS.flatMap((t) => t.preguntas).map((q) => ({
            "@type": "Question",
            name: q.p,
            acceptedAnswer: { "@type": "Answer", text: q.r },
          })),
        }}
      />

      <HeroInterior
        id="qa-titulo"
        antetitulo="Preguntas frecuentes"
        titulo={
          <>
            Respuestas claras <span className={s.tenue}>antes de decidir.</span>
          </>
        }
        lead="Lo que preguntan dirección, operación y compras antes de contratar."
        acciones={
          <>
            <Link href="/contacto" className={`${s.boton} ${s.botonPrimario}`} data-track-conversion="qa_primary_cta">
              Cotiza tu proyecto
              <Flecha />
            </Link>
            <Link href="/servicios" className={`${s.boton} ${s.botonSecundario}`} data-track-conversion="qa_services_cta">
              Ver servicios
              <Flecha />
            </Link>
          </>
        }
      />

      <section className={`${s.seccion} ${s.seccionAlt}`} aria-label="Preguntas por tema">
        <div className={s.contenedor}>
          <div className={i.temas} style={{ marginTop: 0 }}>
            {TEMAS.map((t) => (
              <div key={t.tema} className={i.tema} data-aparecer>
                <h2 className={i.temaTitulo}>{t.tema}</h2>
                <Preguntas preguntas={t.preguntas} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <Directorio actual="/qa" titulo="Soluciones recomendadas" industrias={4} porIndustria={2} />

      <Cierre
        titulo={
          <>
            ¿Te quedó una duda? <span className={s.tenue}>Pregúntanos.</span>
          </>
        }
        texto="Te contesta una persona del equipo, no un formulario automático."
        origen="/qa"
      />
    </main>
  );
}
