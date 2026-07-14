import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description:
    "Términos y condiciones de uso de los servicios y plataformas de NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V. (Nexara).",
  alternates: { canonical: "/legal/terminos" },
  robots: { index: true, follow: true },
};

const COMPANY =
  "NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V.";

const ADDRESS =
  "Ignacio Allende 512 local 2, Santiago Momoxpan, San Pedro Cholula, Puebla C.P. 72775";

export default function TerminosPage() {
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Legal</p>
      <h1 className={styles.title}>Términos y Condiciones</h1>
      <p className={styles.updated}>Última actualización: 13/07/2026</p>

      <p className={styles.lead}>
        El uso del sitio web, plataformas digitales y servicios de{" "}
        <strong style={{ color: "#fff" }}>{COMPANY}</strong> (en adelante, “Nexara”) implica la
        aceptación de estos términos. El usuario se compromete a usar los servicios de forma
        lícita y a no afectar la seguridad, disponibilidad o integridad de los sistemas.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Servicios</h2>
        <p className={styles.p}>
          Nexara ofrece productos y servicios de tecnología de la información, incluyendo
          instalación, configuración, mantenimiento y soporte de equipos de cómputo, redes,
          sistemas de videovigilancia (CCTV), telecomunicaciones y demás infraestructura
          tecnológica, conforme a lo contratado y a las cotizaciones o propuestas comerciales
          vigentes.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Uso aceptable</h2>
        <ul className={styles.list}>
          <li>Proporcionar información veraz para cotizaciones, contratos y soporte.</li>
          <li>
            No intentar acceder de forma no autorizada a sistemas, datos o cuentas de terceros.
          </li>
          <li>
            No utilizar las plataformas de soporte o el sitio para fines ilícitos o que vulneren
            derechos de terceros.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Datos personales</h2>
        <p className={styles.p}>
          El tratamiento de datos personales se rige por nuestro{" "}
          <Link className={styles.link} href="/legal/privacidad">
            Aviso de Privacidad Integral
          </Link>{" "}
          y, en lo aplicable, por la{" "}
          <Link className={styles.link} href="/legal/cookies">
            Política de Cookies
          </Link>
          .
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Modificaciones</h2>
        <p className={styles.p}>
          Nexara puede actualizar funcionalidades, políticas y condiciones de servicio cuando
          resulte necesario. Las versiones vigentes se publicarán en{" "}
          <a className={styles.link} href="https://nexara.com.mx/">
            https://nexara.com.mx/
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
            <strong>Domicilio:</strong> {ADDRESS}
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
        </div>
        <p className={styles.note}>Última actualización: 13/07/2026</p>
      </section>
    </main>
  );
}
