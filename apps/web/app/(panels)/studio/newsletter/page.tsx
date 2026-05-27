"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="STUDIO · Contenido"
      title="Newsletter público"
      description="Boletín a clientes, leads y partners. Casos nuevos, productos, contenido educativo del sector."
      icon="✉️"
      capabilities={[
        { icon: "📝", title: "Editor visual", description: "Plantillas responsivas, drag-and-drop, vista previa móvil/desktop." },
        { icon: "🗂️", title: "Segmentación", description: "Por industria, por interés (CCTV / redes / cómputo), por engagement." },
        { icon: "📈", title: "Tracking", description: "Open rate, CTR, unsubscribes, ingresos atribuidos." },
      ]}
      relatedLinks={[
        { href: "/studio/social", label: "Redes sociales", icon: "📱" },
        { href: "/studio/news", label: "Noticias del sitio", icon: "📰" },
      ]}
    />
  );
}
