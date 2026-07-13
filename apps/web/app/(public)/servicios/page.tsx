import React from "react";
import Image from "next/image";
import Link from "next/link";
import shared from "../_shared/public.module.css";

export const metadata = {
  title: "Servicios | Nexara — CCTV, redes, cómputo y soporte",
  description:
    "Capacidades Nexara: videovigilancia, redes empresariales, cómputo, soporte TI y plataformas a medida. Una firma responsable de punta a punta.",
};

export const dynamic = "force-dynamic";

const servicios = [
  {
    id: "cctv",
    badge: "Videovigilancia",
    title: "CCTV que se opera, no solo se instala",
    forWho: "Retail, corporativos, plantas y multi-sede que necesitan evidencia y control.",
    deliverable:
      "Diseño de cobertura, cámaras IP, NVR/VMS, acceso remoto, mantenimiento y capacitación al equipo local.",
  },
  {
    id: "redes",
    badge: "Conectividad",
    title: "Redes y Wi‑Fi estables en cada sede",
    forWho: "Operaciones donde la caída de red detiene ventas, producción o atención.",
    deliverable:
      "Cableado estructurado, switching, Wi‑Fi empresarial, enlaces, telefonía IP y documentación de red.",
  },
  {
    id: "computo",
    badge: "Infraestructura",
    title: "Cómputo e infraestructura lista para el día a día",
    forWho: "Equipos que necesitan estaciones confiables, respaldos y puesta a punto sin drama.",
    deliverable:
      "Estaciones, servidores, racks, almacenamiento, backups y estandarización de imagen/software.",
  },
  {
    id: "soporte",
    badge: "Operación",
    title: "Soporte TI con respuesta humana",
    forWho: "Empresas que no pueden esperar días a que alguien revise el ticket.",
    deliverable:
      "Mesa de ayuda, visitas en sitio, monitoreo básico y acuerdos claros de tiempo de respuesta.",
  },
  {
    id: "software",
    badge: "Software",
    title: "Plataformas a medida cuando el proceso no alcanza",
    forWho: "Procesos críticos donde un sistema genérico frena más de lo que ayuda.",
    deliverable:
      "Aplicaciones web internas, portales e integraciones acotadas al flujo real de tu operación.",
  },
];

const contratacion = [
  {
    num: "01",
    title: "Levantamiento",
    text: "Visita o llamada: entendemos el sitio, el riesgo y la prioridad.",
  },
  {
    num: "02",
    title: "Propuesta cerrada",
    text: "Alcance, materiales, tiempos y costo. Sin letra chiquita.",
  },
  {
    num: "03",
    title: "Entrega con evidencia",
    text: "Instalación, pruebas, documentación y canal de soporte activo.",
  },
];

export default function ServiciosPage() {
  return (
    <main className={shared.page}>
      <section className={shared.hero}>
        <div className={shared.inner}>
          <div className={shared.heroGrid}>
            <div data-reveal="soft">
              <span className={shared.heroEyebrow}>Servicios</span>
              <h1 className={shared.heroTitle}>
                Capacidades para{" "}
                <span className={shared.heroTitleAccent}>operar sin fricciones</span>
              </h1>
              <p className={shared.heroLead}>
                Cinco líneas claras. Cada una con entregable concreto, equipo de campo y
                responsabilidad después de la instalación.
              </p>
              <div className={shared.heroActions}>
                <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                  Solicitar propuesta <span className={shared.btnArrow}>→</span>
                </Link>
                <Link href="/soluciones" className={`${shared.btn} ${shared.btnSecondary}`}>
                  Ver por industria
                </Link>
              </div>
            </div>
            <div className={shared.heroImage} data-reveal="soft">
              <Image
                src="/images/hero/hero-08.png"
                alt="Centro de monitoreo Nexara"
                width={720}
                height={540}
                priority
              />
              <div className={shared.heroImageOverlay} />
            </div>
          </div>
        </div>
      </section>

      <section id="catalogo" className={shared.section}>
        <div className={shared.inner}>
          <div className={shared.sectionHead} data-reveal="soft">
            <span className={shared.eyebrow}>Catálogo</span>
            <h2 className={shared.sectionTitle}>
              Lo que <span className={shared.sectionTitleAccent}>realmente entregamos</span>
            </h2>
            <p className={shared.sectionLead}>
              Sin catálogo infinito. Priorizamos lo que sostiene tu operación diaria.
            </p>
          </div>

          <div className={shared.capabilityList} data-reveal-stagger>
            {servicios.map((s, i) => (
              <article id={s.id} key={s.id} className={shared.editorialRow} data-reveal="up">
                <span className={shared.editorialNum}>0{i + 1}</span>
                <div className={shared.editorialBody}>
                  <span className={shared.editorialBadge}>{s.badge}</span>
                  <h3 className={shared.editorialTitle}>{s.title}</h3>
                  <p className={shared.editorialText}>{s.forWho}</p>
                  <p className={shared.editorialMeta}>{s.deliverable}</p>
                </div>
                <Link href="/contacto" className={shared.editorialCta}>
                  Cotizar <span aria-hidden>→</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${shared.section} ${shared.sectionDivider}`}>
        <div className={shared.inner}>
          <div className={`${shared.sectionHead} ${shared.sectionHeadCenter}`} data-reveal="soft">
            <span className={shared.eyebrow}>Cómo contratas</span>
            <h2 className={shared.sectionTitle}>
              Proceso <span className={shared.sectionTitleAccent}>corto y cerrado</span>
            </h2>
            <p className={shared.sectionLead}>Tres pasos. Sin workshops eternos ni alcance abierto.</p>
          </div>
          <div className={shared.stepGrid} data-reveal-stagger>
            {contratacion.map((p) => (
              <div key={p.num} className={shared.stepItem} data-reveal="up">
                <span className={shared.stepNum}>{p.num}</span>
                <h3 className={shared.stepTitle}>{p.title}</h3>
                <p className={shared.stepText}>{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={shared.section} id="contacto">
        <div className={shared.inner}>
          <div className={shared.ctaShell} data-reveal="up">
            <h2 className={shared.ctaTitle}>
              ¿Necesitas un <span className={shared.sectionTitleAccent}>diagnóstico de sitio</span>?
            </h2>
            <p className={shared.ctaLead}>
              30 minutos. Te decimos qué conviene instalar ahora, qué puede esperar y un
              presupuesto orientativo.
            </p>
            <div className={shared.ctaActions}>
              <Link href="/contacto" className={`${shared.btn} ${shared.btnPrimary}`}>
                Agendar llamada <span className={shared.btnArrow}>→</span>
              </Link>
              <Link href="/nosotros" className={`${shared.btn} ${shared.btnSecondary}`}>
                Conocer al equipo
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
