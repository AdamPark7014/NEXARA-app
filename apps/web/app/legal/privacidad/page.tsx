import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aviso de privacidad",
  alternates: { canonical: "/legal/privacidad" },
  robots: { index: true, follow: true },
};

export default function PrivacidadPage() {
  const mailHref = "mailto:ventas@nexara.com.mx";
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "clamp(20px, 6vw, 48px) clamp(14px, 4vw, 20px)", color: "var(--text-primary)" }}>
      <h1 style={{ fontSize: "clamp(1.75rem, 5.5vw, 2rem)", marginBottom: 12, lineHeight: 1.2 }}>Aviso de Privacidad</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Última actualización: 2 de marzo de 2026</p>
      <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
        En NEXARA tratamos tus datos personales conforme a la legislación aplicable y únicamente para fines
        relacionados con la prestación de servicios, soporte, facturación, comunicaciones comerciales y mejora de
        nuestra plataforma.
      </p>
      <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
        Puedes solicitar acceso, rectificación, cancelación u oposición (ARCO) escribiendo a
        {" "}
        <a href={mailHref}>{mailHref.replace(/^mailto:/, "")}</a>.
      </p>
      <p style={{ lineHeight: 1.7 }}>
        Al utilizar este sitio, aceptas este aviso de privacidad y sus actualizaciones.
      </p>
    </main>
  );
}
