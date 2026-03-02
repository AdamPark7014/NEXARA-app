export default function PrivacidadPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px", color: "var(--text-primary)" }}>
      <h1 style={{ fontSize: 32, marginBottom: 12 }}>Aviso de Privacidad</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Última actualización: 2 de marzo de 2026</p>
      <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
        En NEXARA tratamos tus datos personales conforme a la legislación aplicable y únicamente para fines
        relacionados con la prestación de servicios, soporte, facturación, comunicaciones comerciales y mejora de
        nuestra plataforma.
      </p>
      <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
        Puedes solicitar acceso, rectificación, cancelación u oposición (ARCO) escribiendo a
        {" "}<a href="mailto:ventas@nexara.com.mx">ventas@nexara.com.mx</a>.
      </p>
      <p style={{ lineHeight: 1.7 }}>
        Al utilizar este sitio, aceptas este aviso de privacidad y sus actualizaciones.
      </p>
    </main>
  );
}
