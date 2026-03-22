export default function Head() {
  const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");
  const pageUrl = `${siteUrl}/contacto`;

  return (
    <>
      <title>Contacto | Nexara</title>
      <meta
        name="description"
        content="Contacta a Nexara para recibir una propuesta tecnologica empresarial alineada a tu operacion y objetivos de negocio."
      />
      <link rel="canonical" href={pageUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="Contacto | Nexara" />
      <meta
        property="og:description"
        content="Hablemos de infraestructura, soporte, seguridad y continuidad operativa para tu empresa."
      />
      <meta property="og:url" content={pageUrl} />
      <meta property="og:image" content={`${siteUrl}/logo-nexara.png`} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Contacto | Nexara" />
      <meta
        name="twitter:description"
        content="Envia tu requerimiento y recibe asesoria especializada de Nexara."
      />
      <meta name="twitter:image" content={`${siteUrl}/logo-nexara.png`} />
    </>
  );
}
