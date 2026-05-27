"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="STUDIO · Captación"
      title="Leads del sitio"
      description="Embudo de captación desde el sitio público y redes sociales. Mide qué campaña trae mejor calidad de leads."
      icon="🌐"
      primaryAction={{ href: "/crm/leads", label: "Ver pipeline CRM", icon: "✨" }}
      capabilities={[
        { icon: "📊", title: "Embudo por fuente", description: "Web orgánico, IG, FB, LinkedIn, Ads, referidos." },
        { icon: "💎", title: "Calidad por origen", description: "% que convierte a cotización y cierre por canal." },
        { icon: "💰", title: "CAC por canal", description: "Costo de adquisición de cada lead según gasto publicitario." },
      ]}
      relatedLinks={[
        { href: "/studio/contacts", label: "Contactos web", icon: "📥" },
        { href: "/crm/leads", label: "Leads en CRM", icon: "✨" },
      ]}
    />
  );
}
