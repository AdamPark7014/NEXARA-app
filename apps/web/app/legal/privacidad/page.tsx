import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Aviso de Privacidad Integral",
  description:
    "Aviso de Privacidad Integral de NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V. (Nexara).",
  alternates: { canonical: "/legal/privacidad" },
  robots: { index: true, follow: true },
};

const COMPANY =
  "NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V.";

const ADDRESS =
  "Ignacio Allende 512 local 2, Santiago Momoxpan, San Pedro Cholula, Puebla C.P. 72775";

export default function PrivacidadPage() {
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Legal</p>
      <h1 className={styles.title}>Aviso de Privacidad Integral</h1>
      <p className={styles.updated}>Última actualización: 31/07/2026</p>

      <p className={styles.lead}>
        <strong style={{ color: "#fff" }}>{COMPANY}</strong>, con domicilio en {ADDRESS}, es
        responsable del tratamiento de los datos personales que recaba de sus clientes,
        proveedores, colaboradores, prospectos comerciales y usuarios de sus servicios, de
        conformidad con lo dispuesto por la Ley Federal de Protección de Datos Personales en
        Posesión de los Particulares y demás disposiciones aplicables.
      </p>
      <p className={styles.p}>
        El presente Aviso de Privacidad tiene como finalidad informar la manera en que se
        obtienen, utilizan, almacenan, protegen y, en su caso, comparten los datos personales
        que nos son proporcionados.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Datos personales que recabamos</h2>
        <p className={styles.p}>
          Para el desarrollo de nuestras actividades comerciales y de prestación de servicios,
          podremos recabar los siguientes datos personales:
        </p>
        <ul className={styles.list}>
          <li>Nombre completo.</li>
          <li>Razón social.</li>
          <li>Registro Federal de Contribuyentes (RFC).</li>
          <li>Domicilio fiscal y/o comercial.</li>
          <li>Nombre de representantes legales o personas de contacto.</li>
          <li>Cargo o puesto.</li>
          <li>Números telefónicos.</li>
          <li>Correo electrónico.</li>
          <li>Información para facturación.</li>
          <li>Datos bancarios cuando sean necesarios para pagos o devoluciones.</li>
          <li>
            Información relacionada con equipos, infraestructura tecnológica, sistemas
            informáticos, redes, dispositivos electrónicos, CCTV y plataformas administradas
            por nuestros clientes.
          </li>
          <li>
            Información generada durante la atención de reportes, tickets de servicio,
            mantenimientos preventivos y correctivos, instalaciones, soporte técnico y
            seguimiento de incidencias.
          </li>
          <li>
            Registros de acceso a plataformas de soporte, bitácoras de servicio, evidencia
            fotográfica y documentación técnica relacionada con los servicios contratados.
          </li>
        </ul>
        <p className={styles.p}>
          La empresa no recaba datos personales sensibles, salvo que por la naturaleza de
          algún servicio específico resulte estrictamente necesario y exista el consentimiento
          correspondiente.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Finalidades del tratamiento</h2>
        <p className={styles.p}>
          Los datos personales serán utilizados para las siguientes finalidades primarias:
        </p>
        <ul className={styles.list}>
          <li>Elaborar cotizaciones y propuestas comerciales.</li>
          <li>Celebrar contratos y dar cumplimiento a las obligaciones derivadas de los mismos.</li>
          <li>
            Proveer productos de tecnología de la información, software, hardware y soluciones
            tecnológicas.
          </li>
          <li>
            Prestar servicios de instalación, configuración, mantenimiento, reparación y
            soporte técnico de equipos de cómputo, servidores, redes, sistemas de
            videovigilancia (CCTV), control de acceso, telecomunicaciones y demás
            infraestructura tecnológica.
          </li>
          <li>
            Gestionar, atender y dar seguimiento a reportes técnicos, solicitudes de soporte y
            tickets de servicio.
          </li>
          <li>Programar visitas técnicas, mantenimientos preventivos y correctivos.</li>
          <li>Administrar garantías, devoluciones y servicios postventa.</li>
          <li>Emitir facturación y realizar procesos administrativos, contables y fiscales.</li>
          <li>Mantener comunicación con clientes, proveedores y usuarios autorizados.</li>
          <li>Cumplir obligaciones legales y requerimientos de autoridades competentes.</li>
        </ul>
        <p className={styles.p}>
          De manera adicional, y únicamente cuando el titular no manifieste su oposición, los
          datos podrán utilizarse para:
        </p>
        <ul className={styles.list}>
          <li>Enviar información sobre nuevos productos y servicios.</li>
          <li>Compartir boletines técnicos o comerciales.</li>
          <li>Realizar encuestas de satisfacción.</li>
          <li>
            Informar sobre promociones, actualizaciones tecnológicas, eventos y capacitaciones.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Transferencia de datos personales</h2>
        <p className={styles.p}>
          Los datos personales podrán ser compartidos únicamente cuando sea necesario para el
          cumplimiento de las finalidades descritas, incluyendo proveedores de servicios
          tecnológicos, fabricantes, distribuidores autorizados, empresas de mensajería,
          instituciones financieras, asesores profesionales y autoridades competentes cuando
          exista obligación legal.
        </p>
        <p className={styles.p}>
          En ningún caso se comercializarán los datos personales de nuestros clientes o
          usuarios.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Medidas de seguridad</h2>
        <p className={styles.p}>
          {COMPANY} implementa medidas administrativas, técnicas y físicas razonables para
          proteger los datos personales contra daño, pérdida, alteración, destrucción, uso,
          acceso o tratamiento no autorizado.
        </p>
        <p className={styles.p}>
          El acceso a la información se encuentra limitado al personal autorizado y únicamente
          para el desempeño de sus funciones.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Derechos ARCO</h2>
        <p className={styles.p}>
          El titular de los datos personales podrá ejercer en cualquier momento sus derechos de
          Acceso, Rectificación, Cancelación u Oposición (ARCO), así como revocar el
          consentimiento otorgado para el tratamiento de sus datos, mediante solicitud dirigida
          al responsable de datos personales al correo electrónico{" "}
          <a className={styles.link} href="mailto:gerencia@nexara.com.mx">
            gerencia@nexara.com.mx
          </a>
          .
        </p>
        <p className={styles.p}>La solicitud deberá contener, al menos:</p>
        <ul className={styles.list}>
          <li>Nombre del titular.</li>
          <li>Datos de contacto para recibir respuesta.</li>
          <li>Documentos que acrediten su identidad o representación legal.</li>
          <li>
            Descripción clara de los datos respecto de los cuales desea ejercer algún derecho.
          </li>
          <li>Cualquier elemento que facilite la localización de la información.</li>
        </ul>
        <p className={styles.p}>
          La empresa dará respuesta dentro de los plazos establecidos por la legislación
          aplicable.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Uso de cookies y tecnologías similares</h2>
        <p className={styles.p}>
          Nuestro sitio web, plataformas digitales o sistemas de soporte podrán utilizar
          cookies, registros de navegación y tecnologías similares para mejorar la experiencia
          del usuario, analizar el funcionamiento de nuestros servicios y fortalecer la
          seguridad de la información.
        </p>
        <p className={styles.p}>
          En el sitio público mostramos un aviso de cookies para que usted decida si autoriza
          cookies no esenciales (analítica y preferencias). Las cookies necesarias para el
          funcionamiento y la seguridad se mantienen activas. Puede cambiar su elección en
          cualquier momento desde <em>Gestionar cookies</em> en el pie de página, o limitar
          cookies desde su navegador (algunas funcionalidades podrían verse afectadas).
          Consulta también nuestra{" "}
          <Link className={styles.link} href="/legal/cookies">
            Política de Cookies
          </Link>
          .
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Cambios al aviso de privacidad</h2>
        <p className={styles.p}>
          {COMPANY} podrá modificar o actualizar el presente Aviso de Privacidad cuando resulte
          necesario por cambios legales, operativos o de políticas internas.
        </p>
        <p className={styles.p}>
          Las modificaciones estarán disponibles en nuestro sitio web{" "}
          <a className={styles.link} href="https://nexara.com.mx/">
            https://nexara.com.mx/
          </a>{" "}
          o podrán solicitarse directamente a través de nuestros medios de contacto.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Contacto</h2>
        <p className={styles.p}>
          Para cualquier duda relacionada con este Aviso de Privacidad o con el tratamiento de
          sus datos personales, puede comunicarse con nosotros mediante:
        </p>
        <div className={styles.contactBox}>
          <p>
            <strong>{COMPANY}</strong>
          </p>
          <p>
            <strong>Domicilio:</strong> {ADDRESS}
          </p>
          <p>
            <strong>Correo electrónico:</strong>{" "}
            <a className={styles.link} href="mailto:gerencia@nexara.com.mx">
              gerencia@nexara.com.mx
            </a>
          </p>
          <p>
            <strong>Teléfono:</strong>{" "}
            <a className={styles.link} href="tel:+522201791871">
              220 179 1871
            </a>
          </p>
          <p>
            <strong>Sitio web:</strong>{" "}
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
