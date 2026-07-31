import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Política de Cookies",
  description:
    "Política de cookies y tecnologías similares de NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V. (Nexara).",
  alternates: { canonical: "/legal/cookies" },
  robots: { index: true, follow: true },
};

const COMPANY =
  "NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V.";

export default function CookiesPage() {
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Legal</p>
      <h1 className={styles.title}>Política de Cookies</h1>
      <p className={styles.updated}>Última actualización: 31/07/2026</p>

      <p className={styles.lead}>
        Esta política complementa el{" "}
        <Link className={styles.link} href="/legal/privacidad">
          Aviso de Privacidad Integral
        </Link>{" "}
        de <strong style={{ color: "#fff" }}>{COMPANY}</strong> (Nexara) y describe el uso de
        cookies, registros de navegación y tecnologías similares en nuestro sitio web,
        plataformas digitales y sistemas de soporte.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>¿Qué son las cookies?</h2>
        <p className={styles.p}>
          Las cookies son pequeños archivos o registros que se almacenan en su dispositivo
          cuando visita un sitio web o utiliza una plataforma digital. Permiten recordar
          preferencias, mantener sesiones seguras, medir el funcionamiento del servicio y
          fortalecer la seguridad de la información.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Tipos de cookies que podemos utilizar</h2>
        <ul className={styles.list}>
          <li>
            <strong style={{ color: "#fff" }}>Cookies técnicas o necesarias:</strong> permiten
            el funcionamiento básico del sitio, la autenticación de sesiones y la seguridad de
            la plataforma. Se activan automáticamente porque son indispensables.
          </li>
          <li>
            <strong style={{ color: "#fff" }}>Cookies de preferencia:</strong> recuerdan
            configuraciones de navegación o de interfaz cuando usted las autoriza.
          </li>
          <li>
            <strong style={{ color: "#fff" }}>Cookies de analítica / rendimiento:</strong>{" "}
            ayudan a entender el uso de nuestros servicios (por ejemplo Google Analytics y
            métricas propias del sitio público) para mejorar la experiencia y detectar fallas.
            Solo se activan con su consentimiento.
          </li>
          <li>
            <strong style={{ color: "#fff" }}>Registros y bitácoras de soporte:</strong>{" "}
            pueden generarse al usar sistemas de tickets, mesas de ayuda o portales de servicio,
            con fines operativos y de seguridad.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Finalidades</h2>
        <p className={styles.p}>Utilizamos estas tecnologías para:</p>
        <ul className={styles.list}>
          <li>Mejorar la experiencia del usuario.</li>
          <li>Analizar el funcionamiento de nuestros servicios (con consentimiento).</li>
          <li>Fortalecer la seguridad de la información.</li>
          <li>
            Mantener sesiones y prevenir accesos no autorizados a plataformas de clientes o
            soporte.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Consentimiento y gestión</h2>
        <p className={styles.p}>
          Al visitar el sitio público de NEXARA verá un aviso de cookies. Puede{" "}
          <strong style={{ color: "#fff" }}>aceptar todas</strong>, elegir{" "}
          <strong style={{ color: "#fff" }}>solo las necesarias</strong> o{" "}
          <strong style={{ color: "#fff" }}>configurar</strong> categorías (analítica y
          preferencias). Su elección se guarda en su navegador y puede cambiarla en cualquier
          momento desde el enlace <em>Gestionar cookies</em> del pie de página.
        </p>
        <p className={styles.p}>
          Las cookies no esenciales (analítica y preferencias) no se cargan hasta que usted las
          autorice. También puede limitar cookies desde la configuración de su navegador; algunas
          funcionalidades del sitio o de las plataformas de soporte podrían verse afectadas.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Datos personales y derechos</h2>
        <p className={styles.p}>
          Cuando las cookies o registros permitan identificar a una persona, dicha información
          se trata conforme al{" "}
          <Link className={styles.link} href="/legal/privacidad">
            Aviso de Privacidad Integral
          </Link>
          , incluyendo el ejercicio de derechos ARCO ante{" "}
          <a className={styles.link} href="mailto:gerencia@nexara.com.mx">
            gerencia@nexara.com.mx
          </a>
          .
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Contacto</h2>
        <div className={styles.contactBox}>
          <p>
            <strong>{COMPANY}</strong>
          </p>
          <p>
            Ignacio Allende 512 local 2, Santiago Momoxpan, San Pedro Cholula, Puebla C.P. 72775
          </p>
          <p>
            Correo:{" "}
            <a className={styles.link} href="mailto:gerencia@nexara.com.mx">
              gerencia@nexara.com.mx
            </a>
          </p>
          <p>
            Teléfono:{" "}
            <a className={styles.link} href="tel:+522201791871">
              220 179 1871
            </a>
          </p>
          <p>
            Sitio:{" "}
            <a className={styles.link} href="https://nexara.com.mx/">
              https://nexara.com.mx/
            </a>
          </p>
        </div>
        <p className={styles.note}>Última actualización: 31/07/2026</p>
      </section>
    </main>
  );
}
