"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="STUDIO · Contenido"
      title="Noticias y blog"
      description="Publicaciones del blog público (SEO) y noticias destacadas que aparecen en /noticias del sitio."
      icon="📰"
      primaryAction={{ href: "/studio/pages", label: "Páginas del sitio", icon: "🖼️" }}
      capabilities={[
        { icon: "✍️", title: "Editor markdown+", description: "Con imágenes, embeds de YouTube y código si aplica." },
        { icon: "🔍", title: "SEO toolkit", description: "Meta tags, OG image, slug, keyword density, vista previa Google." },
        { icon: "🗓️", title: "Calendario editorial", description: "Programa publicaciones futuras y mantén consistencia." },
      ]}
      relatedLinks={[
        { href: "/studio/cases", label: "Casos de éxito", icon: "🏆" },
        { href: "/studio/social", label: "Redes sociales", icon: "📱" },
      ]}
    />
  );
}
