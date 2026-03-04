export default function MarcaPage() {
  return (
    <main
      style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: "clamp(20px, 6vw, 48px) clamp(14px, 4vw, 20px)",
        color: "var(--foreground)",
      }}
    >
      <h1 style={{ fontSize: "clamp(1.75rem, 5.5vw, 2rem)", marginBottom: 12, lineHeight: 1.2 }}>
        Biblia de Marca — NEXARA
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
        Última actualización: 3 de marzo de 2026
      </p>

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>1. Slogan oficial</h2>
        <p style={{ lineHeight: 1.7 }}>
          Tecnología que impulsa tu negocio.
        </p>
      </section>

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>2. Uso del logotipo</h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.75 }}>
          <li>Usar preferentemente la versión principal sobre fondo limpio o de alto contraste.</li>
          <li>Mantener un área de seguridad mínima equivalente al alto de la letra “N” alrededor del logo.</li>
          <li>No deformar, rotar ni aplicar filtros excesivos que alteren identidad.</li>
          <li>Evitar usar el logo sobre fondos con ruido visual fuerte sin contenedor.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>3. Paleta cromática base</h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.75 }}>
          <li>Primario: #0F6FFF</li>
          <li>Secundario: #0FB9A8</li>
          <li>Acento: #27D3BE</li>
          <li>Texto principal: #0D2C4F</li>
          <li>Superficie clara: #F7FBFF</li>
        </ul>
        <p style={{ lineHeight: 1.7, marginTop: 10 }}>
          Estas variantes mantienen una percepción corporativa, tecnológica y moderna sin caer en tonos grises apagados.
        </p>
      </section>

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>4. Tipografía</h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.75 }}>
          <li>Títulos y encabezados: familia sans serif moderna (Inter/Geist/Segoe UI).</li>
          <li>Texto corrido: sans serif legible para web y mobile.</li>
          <li>Evitar tipografías serif clásicas para UI principal.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>5. Redes sociales y presencia</h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.75 }}>
          <li>Los íconos deben ser visibles, de alto contraste y con tamaño mínimo de 40px en footer.</li>
          <li>Cada red puede tener acento de color propio para mejorar reconocimiento visual.</li>
          <li>Mencionar plazas o zonas de operación en el bloque social cuando aplique.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>6. Fotografía y contenido visual</h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.75 }}>
          <li>Priorizar fotografías reales de proyectos y operación de campo.</li>
          <li>Reducir uso de imágenes genéricas de internet cuando existan activos propios.</li>
          <li>Mantener coherencia de iluminación y tono corporativo en galerías y banners.</li>
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>7. Aplicación digital</h2>
        <p style={{ lineHeight: 1.7 }}>
          Esta guía aplica para sitio web público, paneles, piezas comerciales y redes. Cualquier nueva pieza debe validar slogan,
          tipografía, color y uso de logo antes de publicación.
        </p>
      </section>
    </main>
  );
}
