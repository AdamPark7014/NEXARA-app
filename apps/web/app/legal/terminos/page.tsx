import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  alternates: { canonical: "/legal/terminos" },
  robots: { index: true, follow: true },
};

export default function TerminosPage() {
  const mailHref = "mailto:ventas@nexara.com.mx";
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "clamp(20px, 6vw, 48px) clamp(14px, 4vw, 20px)", color: "var(--text-primary)" }}>
      <h1 style={{ fontSize: "clamp(1.75rem, 5.5vw, 2rem)", marginBottom: 12, lineHeight: 1.2 }}>Términos y Condiciones</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Última actualización: 2 de marzo de 2026</p>
      <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
        El uso de la plataforma NEXARA implica la aceptación de estos términos. El usuario se compromete a usar
        los servicios de forma lícita y a no afectar la seguridad, disponibilidad o integridad del sistema.
      </p>
      <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
        NEXARA puede actualizar funcionalidades, políticas y condiciones de servicio en cualquier momento.
      </p>
      <p style={{ lineHeight: 1.7 }}>
        Para dudas sobre estos términos, contáctanos en {" "}<a href={mailHref}>{mailHref.replace(/^mailto:/, "")}</a>.
      </p>
    </main>
  );
}
