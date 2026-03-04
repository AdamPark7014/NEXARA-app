import FAQ from "../../components/FAQ";
import styles from "./page.module.css";

export const metadata = {
  title: "Q&A | Nexara",
  description: "Respuestas ejecutivas sobre servicios, tiempos de implementación y cobertura de Nexara.",
};

export default function QAPage() {
  return (
    <main className={styles.container} aria-label="Página de preguntas y respuestas">
      <section className={styles.hero}>
        <span className={styles.badge}>Q&A ESTRATÉGICO</span>
        <h1 className={styles.title}>Respuestas claras para tomar decisiones tecnológicas</h1>
        <p className={styles.subtitle}>
          Consulta en un solo lugar las preguntas clave de dirección, operación y compras.
        </p>
      </section>

      <section className={styles.content}>
        <FAQ />
      </section>
    </main>
  );
}
