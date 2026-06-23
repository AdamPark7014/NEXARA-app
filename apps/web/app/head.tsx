export default function Head() {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/$/, "");
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "NEXARA",
    url: baseUrl,
    logo: `${baseUrl}/logo-nexara.png`,
    sameAs: [
      "https://nexara.com.mx",
      "https://www.nexara.com.mx",
    ],
  };
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "NEXARA",
    url: baseUrl,
    inLanguage: "es-MX",
  };

  return (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content="#0f6ad6" />
      <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
      <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
      <link rel="dns-prefetch" href="https://maps.googleapis.com" />
      <link rel="dns-prefetch" href="https://maps.gstatic.com" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://maps.googleapis.com" />
      <link rel="preconnect" href="https://maps.gstatic.com" crossOrigin="anonymous" />
      <link rel="icon" href="/logo-nexara.png" type="image/png" />
      <link rel="apple-touch-icon" href="/logo-nexara.png" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
    </>
  );
}
