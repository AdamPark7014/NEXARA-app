"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "../page.module.css";

type QA = { q: string; a: string; category: string };

const items: QA[] = [
  { q: "¿Cuáles son nuestros servicios?", category: "Servicios", a: "Ofrecemos una amplia gama de soluciones tecnológicas: Venta de computadoras y periféricos, Videovigilancia y seguridad física, Redes y conectividad, Licenciamiento de software, Soporte técnico empresarial con cobertura a múltiples sucursales, Mantenimiento preventivo y correctivo, Cableado estructurado, Control de acceso, Comunicaciones, Servidores, Señalización digital, Desarrollo de software a medida, Diseño y desarrollo de páginas web, Aplicaciones móviles, además de integración de soluciones (infraestructura, energía, centros de datos y ciberseguridad), consultoría y soporte especializado." },
  { q: "¿Por qué elegir a Nexara?", category: "General", a: "+10 años de experiencia, atención personalizada, alianzas con marcas líderes y soluciones llave en mano de principio a fin." },
  { q: "¿Cuál es la mejor solución para mis necesidades?", category: "General", a: "En NEXARA, tu satisfacción es nuestra prioridad. Estamos aquí para escucharte y encontrar la mejor solución para tus necesidades. Nuestro equipo de expertos está disponible para resolver cualquier duda o problema antes, durante y después de la implementación. Ofrecemos atención personalizada, soporte continuo, tiempo de respuesta menor a 24 horas hábiles, levantamientos en sitio, soporte técnico, envíos a toda la República, contacto directo con marcas especializadas y centro de servicios de marcas especializadas." },
  { q: "¿Qué marcas manejan?", category: "Marcas", a: "Trabajamos con fabricantes reconocidos a nivel mundial. Revisa la sección de marcas para conocer algunas de ellas." },
  { q: "¿Tienen soporte post-venta?", category: "Soporte", a: "Sí, brindamos soporte post-venta, mantenimiento preventivo/correctivo, soporte técnico empresarial para múltiples sucursales, y capacitación cuando se requiere." },
  { q: "¿Cómo solicito una cotización?", category: "Ventas", a: "Usa el formulario de contacto para compartir tus necesidades o escríbenos a nuestro correo. Te responderemos con una propuesta personalizada." },
  { q: "¿Cuál es el tiempo de entrega?", category: "Ventas", a: "Depende del producto y la solución. Equipos estándar suelen estar disponibles de inmediato; proyectos de integración se calendarizan según alcance." },
  { q: "¿Ofrecen garantías?", category: "Ventas", a: "Sí, respetamos las garantías del fabricante y gestionamos RMA cuando aplica." },
  { q: "¿Trabajan con gobierno y empresas?", category: "General", a: "Sí, atendemos sector empresarial y gubernamental con cumplimiento documental y procesos formales de compra." },
];

const slugify = (s: string) => s
  .toLowerCase()
  .normalize("NFD")
  .replace(/\p{Diacritic}+/gu, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

export default function FAQ() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("Todos");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return ["Todos", ...Array.from(set)];
  }, []);

  const faqs = useMemo(() => {
    return items
      .filter((i) => (category === "Todos" ? true : i.category === category))
      .filter((i) => i.q.toLowerCase().includes(query.toLowerCase()) || i.a.toLowerCase().includes(query.toLowerCase()));
  }, [category, query]);

  // Deep link support: #faq-<slug>
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.startsWith("#faq-")) {
      const target = hash.replace("#faq-", "");
      const idx = items.findIndex((i) => slugify(i.q) === target);
      if (idx >= 0) setOpenIndex(idx);
    }
  }, []);

  const toggle = (i: number) => {
    setOpenIndex((prev) => (prev === i ? null : i));
    // If the question is the quotation one, request opening the contact panel
    const item = items[i];
    if (item && item.q.toLowerCase().includes("cotización")) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("open-contact-request"));
      }
    }
    if (typeof window !== "undefined" && items[i]) {
      const id = slugify(items[i].q);
      history.replaceState(null, "", `#faq-${id}`);
    }
  };

  // Keyboard navigation for accessibility
  const onKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (e) => {
    const idx = btnRefs.current.indexOf(e.currentTarget);
    const is = (i: number) => (i >= 0 && i < btnRefs.current.length ? btnRefs.current[i] : null);
    if (e.key === "ArrowDown") { is(idx + 1)?.focus(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { is(idx - 1)?.focus(); e.preventDefault(); }
    else if (e.key === "Home") { is(0)?.focus(); e.preventDefault(); }
    else if (e.key === "End") { is(btnRefs.current.length - 1)?.focus(); e.preventDefault(); }
  };

  // SEO JSON-LD
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  };

  return (
    <section className={styles.faqSection}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className={styles.faqHeader}>
        <div className={styles.faqBadge}>Q&A ESTRATÉGICO</div>
        <h2 className={styles.faqTitle}>Q&A</h2>
        <p className={styles.faqSubtitle}>Respuestas claras sobre soluciones, implementación y soporte para tu operación.</p>
      </div>

      <div className={styles.faqControls}>
        <div className={styles.faqFilters}>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.faqChip} ${category === c ? styles.faqChipActive : ""}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <input
          className={styles.faqSearch}
          type="search"
          placeholder="Buscar pregunta o respuesta…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar en FAQ"
        />
      </div>

      <div className={styles.faqList}>
        {faqs.length === 0 && (
          <div className={styles.faqEmpty}>Sin resultados. Prueba otra palabra o categoría.</div>
        )}
        {faqs.map((item) => {
          const globalIndex = items.findIndex((x) => x.q === item.q);
          const isOpen = openIndex === globalIndex;
          const id = slugify(item.q);
          return (
            <div className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ""}`} key={item.q}>
              <button
                ref={(el) => { if (el) btnRefs.current[globalIndex] = el; }}
                className={styles.faqQuestion}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${id}`}
                onClick={() => toggle(globalIndex)}
                onKeyDown={onKeyDown}
              >
                <span className={styles.faqQ}>{item.q}</span>
                <span className={styles.faqIndicator}>{isOpen ? "−" : "+"}</span>
              </button>
              <div id={`faq-panel-${id}`} role="region" className={styles.faqAnswer} style={{ maxHeight: isOpen ? 260 : 0 }}>
                <p>{item.a}</p>
                <div className={styles.faqMeta}><span className={styles.faqCategory}>{item.category}</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
