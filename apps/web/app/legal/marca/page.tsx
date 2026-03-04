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
        Última actualización: 4 de marzo de 2026
      </p>

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>1. Slogan oficial</h2>
        <p style={{ lineHeight: 1.7 }}>
          Transformamos tecnología en resultados reales.
        </p>
        <p style={{ lineHeight: 1.7, marginTop: 10 }}>
          Uso recomendado: encabezados principales de web, presentaciones comerciales y piezas institucionales.
          Evitar su uso en bloques donde compita con titulares promocionales.
        </p>
      </section>

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>2. ¿Cómo, dónde, cuándo y para qué usar el logotipo?</h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.75 }}>
          <li><strong>Cómo:</strong> usar la versión horizontal principal en headers, portadas y firmas corporativas.</li>
          <li><strong>Dónde:</strong> sitio público, subdominios de panel, firmas de correo, propuestas y documentos legales.</li>
          <li><strong>Cuándo:</strong> siempre que la pieza represente oficialmente a NEXARA frente a cliente o aliado.</li>
          <li><strong>Para qué:</strong> reforzar reconocimiento de marca y consistencia visual entre canales.</li>
          <li>Mantener un área de seguridad mínima equivalente al alto de la letra “N” alrededor del logo.</li>
          <li>No deformar, rotar ni aplicar filtros, sombras agresivas o efectos 3D que alteren la identidad.</li>
          <li>Evitar usar el logo sobre fondos con ruido visual fuerte sin contenedor sólido.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>3. Variaciones permitidas del logo</h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.75 }}>
          <li>Versión principal a color: uso predeterminado en fondos claros y piezas digitales.</li>
          <li>Versión monocromática clara: uso sobre fondos oscuros o fotográficos.</li>
          <li>Versión monocromática oscura: uso en impresos a una tinta o fondos muy claros.</li>
          <li>No crear nuevas variantes de color sin validación de dirección de marca.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>4. Paleta cromática y significado</h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.75 }}>
          <li>Primario: #1166FF — innovación, confianza y dirección tecnológica.</li>
          <li>Secundario: #00BFA6 — dinamismo, cercanía operativa y evolución continua.</li>
          <li>Acento: #00D7C1 — energía visual para CTA, estados activos y elementos clave.</li>
          <li>Texto principal: #0B2E57 — lectura firme en digital sin verse oscuro o apagado.</li>
          <li>Superficie clara: #F3FBFF — limpieza visual y contraste en interfaces.</li>
        </ul>
        <p style={{ lineHeight: 1.7, marginTop: 10 }}>
          Estas variantes mantienen una percepción corporativa, tecnológica y moderna evitando tonos grises opacos.
        </p>
      </section>

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>5. Tipografía oficial</h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.75 }}>
          <li>Títulos: Geist/Manrope (sans moderna, de alto impacto).</li>
          <li>Subtítulos: Sora/Inter (estructura y jerarquía).</li>
          <li>Texto corrido: Inter/Geist (lectura continua en web y mobile).</li>
          <li>Evitar serif clásicas (ej. Times New Roman) en la UI principal.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>6. Redes sociales y presencia</h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.75 }}>
          <li>Los íconos deben ser visibles, de alto contraste y con tamaño mínimo de 46px en footer.</li>
          <li>Cada red debe contar con bloque de color propio para reconocimiento inmediato.</li>
          <li>Mostrar ubicación de operación en grande: “PARQUE ECOLÓGICO”.</li>
          <li>Estado de presencia actual: TikTok sin contenido, Instagram 1 publicación, LinkedIn sin contenido.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>7. Fotografía y contenido visual</h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.75 }}>
          <li>Priorizar fotografías reales de proyectos, personal técnico y operación de campo.</li>
          <li>Reducir uso de imágenes genéricas de internet cuando existan activos propios verificables.</li>
          <li>Mantener coherencia de iluminación y tono corporativo en galerías y banners.</li>
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>8. Aplicación digital</h2>
        <p style={{ lineHeight: 1.7 }}>
          Esta guía aplica para sitio web público, paneles, piezas comerciales y redes. Cualquier nueva pieza debe validar slogan,
          tipografía, color y uso de logo antes de publicación.
        </p>
      </section>
    </main>
  );
}
