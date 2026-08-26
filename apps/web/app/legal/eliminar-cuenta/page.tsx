import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Eliminación de cuenta y datos",
  description:
    "Cómo solicitar la eliminación de tu cuenta NEXARA y de los datos personales asociados, incluyendo la app móvil de Google Play.",
  alternates: { canonical: "/legal/eliminar-cuenta" },
  robots: { index: true, follow: true },
};

/** Misma razón social y domicilio que el aviso de privacidad oficial. */
const COMPANY =
  "NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V.";

const ADDRESS =
  "Ignacio Allende 512 local 2, Santiago Momoxpan, San Pedro Cholula Puebla C.P. 72775";

const CONTACT_EMAIL = "gerencia@nexara.com.mx";

export default function EliminarCuentaPage() {
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Legal</p>
      <h1 className={styles.title}>Eliminación de cuenta y datos</h1>
      <p className={styles.updated}>Última actualización: 17/08/2026</p>

      <p className={styles.lead}>
        Esta página explica cómo solicitar la eliminación de una cuenta de la plataforma
        NEXARA y de los datos personales asociados a ella, tanto en la versión web como en
        la aplicación móvil <strong style={{ color: "#fff" }}>NEXARA</strong> (identificador{" "}
        <code>mx.nexara.mobile.nativeapp</code>), publicada por{" "}
        <strong style={{ color: "#fff" }}>{COMPANY}</strong>.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Antes de empezar</h2>
        <p className={styles.p}>
          NEXARA es una plataforma de uso profesional. Las cuentas no se crean desde la app:
          las da de alta el administrador de la organización que contrató el servicio, y esa
          organización es la responsable de la información de negocio que se registra en la
          plataforma.
        </p>
        <p className={styles.p}>
          Por eso hay dos vías para pedir la eliminación, según quién seas:
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Eres usuario de una organización cliente.</strong> Pídelo al administrador
            de tu organización, que puede desactivar y eliminar tu cuenta desde el propio
            panel. Si no tienes forma de contactarlo, escríbenos y nosotros lo gestionamos.
          </li>
          <li>
            <strong>Eres el titular de los datos y prefieres solicitarlo directamente.</strong>{" "}
            Envíanos la solicitud por correo con los datos que se indican abajo.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Cómo solicitar la eliminación</h2>
        <p className={styles.p}>
          Envía un correo a{" "}
          <a className={styles.link} href={`mailto:${CONTACT_EMAIL}?subject=Eliminación%20de%20cuenta%20NEXARA`}>
            {CONTACT_EMAIL}
          </a>{" "}
          con el asunto <strong style={{ color: "#fff" }}>«Eliminación de cuenta NEXARA»</strong> e
          incluye:
        </p>
        <ul className={styles.list}>
          <li>Nombre completo del titular de la cuenta.</li>
          <li>Correo electrónico con el que inicias sesión en NEXARA.</li>
          <li>Nombre de la organización a la que pertenece la cuenta.</li>
          <li>Documento que acredite tu identidad o representación legal.</li>
          <li>
            Si solo quieres eliminar cierta información y no la cuenta completa, descríbela con
            claridad.
          </li>
        </ul>
        <p className={styles.p}>
          Verificamos la identidad del solicitante antes de ejecutar cualquier eliminación, y
          damos respuesta en los plazos que fija la Ley Federal de Protección de Datos
          Personales en Posesión de los Particulares. Puedes ejercer este derecho junto con el
          resto de tus{" "}
          <Link className={styles.link} href="/legal/privacidad">
            derechos ARCO
          </Link>
          .
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Qué datos se eliminan</h2>
        <p className={styles.p}>
          Al confirmarse la solicitud, se eliminan de forma permanente los datos personales
          vinculados a la cuenta:
        </p>
        <ul className={styles.list}>
          <li>Perfil del usuario: nombre, correo, teléfono, puesto, fotografía y credenciales de acceso.</li>
          <li>Sesiones activas y tokens de inicio de sesión.</li>
          <li>Identificador del dispositivo y token de notificaciones push.</li>
          <li>Registros de ubicación generados por el usuario en la app móvil.</li>
          <li>Fotografías y archivos de evidencia cargados por el usuario, salvo lo indicado abajo.</li>
          <li>Preferencias, notificaciones y bitácoras de actividad asociadas a la cuenta.</li>
        </ul>
        <p className={styles.p}>
          Desinstalar la aplicación borra los datos que quedan en el teléfono, pero no elimina
          la cuenta en el servidor: para eso hace falta la solicitud descrita arriba.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Qué información puede conservarse</h2>
        <p className={styles.p}>
          Cierta información no se elimina de inmediato, por obligación legal o porque no
          pertenece al titular de la cuenta sino a la organización contratante:
        </p>
        <ul className={styles.list}>
          <li>
            Comprobantes fiscales, facturación y registros contables, durante los plazos que
            exige la legislación fiscal y mercantil mexicana.
          </li>
          <li>
            Registros de servicios, órdenes de trabajo, tickets y evidencias que forman parte
            del expediente de la organización cliente, que es la responsable de esos datos.
          </li>
          <li>
            Bitácoras de seguridad necesarias para acreditar el cumplimiento de obligaciones o
            atender requerimientos de autoridad competente.
          </li>
          <li>
            Información que deba conservarse para el ejercicio o defensa de reclamaciones
            legales.
          </li>
        </ul>
        <p className={styles.p}>
          En esos casos la información se desvincula de la cuenta y se restringe su uso al fin
          que obliga a conservarla. Una vez vencido el plazo aplicable, se elimina.
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
            <strong>Correo electrónico:</strong>{" "}
            <a className={styles.link} href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          </p>
          <p>
            <strong>Teléfono:</strong>{" "}
            <a className={styles.link} href="tel:+522226960350">
              2226960350
            </a>
          </p>
          <p>
            <strong>Aviso de privacidad:</strong>{" "}
            <Link className={styles.link} href="/legal/privacidad">
              nexara.com.mx/legal/privacidad
            </Link>
          </p>
        </div>
        <p className={styles.note}>
          Esta página es pública y no requiere iniciar sesión, conforme a los requisitos de
          eliminación de datos de Google Play.
        </p>
      </section>
    </main>
  );
}
