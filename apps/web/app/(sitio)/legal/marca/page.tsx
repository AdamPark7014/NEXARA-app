import type { Metadata } from "next";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Uso de marca",
  description:
    "Guía de uso de marca NEXARA: slogan, tipografías, colores y reglas de aplicación del logo.",
  alternates: { canonical: "/legal/marca" },
  robots: { index: true, follow: true },
};

const PALETA = [
  { nombre: "Primario", hex: "#1166FF", texto: "innovación, confianza y dirección tecnológica." },
  { nombre: "Secundario", hex: "#00BFA6", texto: "dinamismo, cercanía operativa y evolución continua." },
  { nombre: "Acento", hex: "#00D7C1", texto: "energía visual para CTA, estados activos y elementos clave." },
  { nombre: "Texto principal", hex: "#0B2E57", texto: "lectura firme en digital sin verse oscuro o apagado." },
  { nombre: "Superficie clara", hex: "#F3FBFF", texto: "limpieza visual y contraste en interfaces." },
];

export default function MarcaPage() {
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Legal</p>
      <h1 className={styles.title}>Biblia de Marca — NEXARA</h1>
      <p className={styles.updated}>Última actualización: 4 de marzo de 2026</p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>1. Slogan oficial</h2>
        <p className={styles.p}>Transformamos tecnología en resultados reales.</p>
        <p className={styles.p}>
          Uso recomendado: encabezados principales de web, presentaciones comerciales y piezas institucionales.
          Evitar su uso en bloques donde compita con titulares promocionales.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>2. ¿Cómo, dónde, cuándo y para qué usar el logotipo?</h2>
        <ul className={styles.list}>
          <li><strong>Cómo:</strong> usar la versión horizontal principal en headers, portadas y firmas corporativas.</li>
          <li><strong>Dónde:</strong> sitio público, subdominios de panel, firmas de correo, propuestas y documentos legales.</li>
          <li><strong>Cuándo:</strong> siempre que la pieza represente oficialmente a NEXARA frente a cliente o aliado.</li>
          <li><strong>Para qué:</strong> reforzar reconocimiento de marca y consistencia visual entre canales.</li>
          <li>Mantener un área de seguridad mínima equivalente al alto de la letra “N” alrededor del logo.</li>
          <li>No deformar, rotar ni aplicar filtros, sombras agresivas o efectos 3D que alteren la identidad.</li>
          <li>Evitar usar el logo sobre fondos con ruido visual fuerte sin contenedor sólido.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>3. Variaciones permitidas del logo</h2>
        <ul className={styles.list}>
          <li>Versión principal a color: uso predeterminado en fondos claros y piezas digitales.</li>
          <li>Versión monocromática clara: uso sobre fondos oscuros o fotográficos.</li>
          <li>Versión monocromática oscura: uso en impresos a una tinta o fondos muy claros.</li>
          <li>No crear nuevas variantes de color sin validación de dirección de marca.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>4. Paleta cromática y significado</h2>
        <ul className={styles.paleta}>
          {PALETA.map((c) => (
            <li key={c.hex}>
              <span className={styles.muestra} style={{ background: c.hex }} aria-hidden="true" />
              <span>
                {c.nombre}: {c.hex} — {c.texto}
              </span>
            </li>
          ))}
        </ul>
        <p className={styles.p}>
          Estas variantes mantienen una percepción corporativa, tecnológica y moderna evitando tonos grises opacos.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>5. Tipografía oficial</h2>
        <ul className={styles.list}>
          <li>Títulos: Geist/Manrope (sans moderna, de alto impacto).</li>
          <li>Subtítulos: Sora/Inter (estructura y jerarquía).</li>
          <li>Texto corrido: Inter/Geist (lectura continua en web y mobile).</li>
          <li>Evitar serif clásicas (ej. Times New Roman) en la UI principal.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>6. Redes sociales y presencia</h2>
        <ul className={styles.list}>
          <li>Los íconos deben ser visibles, de alto contraste y con tamaño mínimo de 46px en footer.</li>
          <li>Cada red debe contar con bloque de color propio para reconocimiento inmediato.</li>
          <li>Mostrar ubicación de operación en grande: “PARQUE ECOLÓGICO”.</li>
          <li>Estado de presencia actual: TikTok sin contenido, Instagram 1 publicación, LinkedIn sin contenido.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>7. Fotografía y contenido visual</h2>
        <ul className={styles.list}>
          <li>Priorizar fotografías reales de proyectos, personal técnico y operación de campo.</li>
          <li>Reducir uso de imágenes genéricas de internet cuando existan activos propios verificables.</li>
          <li>Mantener coherencia de iluminación y tono corporativo en galerías y banners.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>8. Aplicación digital</h2>
        <p className={styles.p}>
          Esta guía aplica para sitio web público, paneles, piezas comerciales y redes. Cualquier nueva pieza debe validar slogan,
          tipografía, color y uso de logo antes de publicación.
        </p>
      </section>
    </main>
  );
}
