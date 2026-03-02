export default function CookiesPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px", color: "var(--text-primary)" }}>
      <h1 style={{ fontSize: 32, marginBottom: 12 }}>Política de Cookies</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>Última actualización: 2 de marzo de 2026</p>
      <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
        Este sitio utiliza cookies técnicas y de analítica para mejorar la experiencia de navegación, medir
        rendimiento y habilitar funcionalidades de la plataforma.
      </p>
      <p style={{ lineHeight: 1.7, marginBottom: 16 }}>
        Puedes configurar tu navegador para bloquear cookies; sin embargo, algunas funciones podrían no operar
        correctamente.
      </p>
      <p style={{ lineHeight: 1.7 }}>
        Si continúas navegando, se entiende que aceptas el uso de cookies conforme a esta política.
      </p>
    </main>
  );
}
