export default function TerminosPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px", color: "var(--text-primary)" }}>
      <h1 style={{ fontSize: 32, marginBottom: 12 }}>Términos y Condiciones</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Última actualización: 2 de marzo de 2026</p>
      <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
        El uso de la plataforma NEXARA implica la aceptación de estos términos. El usuario se compromete a usar
        los servicios de forma lícita y a no afectar la seguridad, disponibilidad o integridad del sistema.
      </p>
      <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
        NEXARA puede actualizar funcionalidades, políticas y condiciones de servicio en cualquier momento.
      </p>
      <p style={{ lineHeight: 1.7 }}>
        Para dudas sobre estos términos, contáctanos en {" "}<a href="mailto:ventas@nexara.com.mx">ventas@nexara.com.mx</a>.
      </p>
    </main>
  );
}
