"use client";
import ModuleStub from "@/components/ui/ModuleStub";
export default function Page() {
  return (
    <ModuleStub
      eyebrow="LAB · Sandbox"
      title="AI Sandbox"
      description="Playground técnico para probar modelos y prompts antes de llevarlos a producción. Solo para el dueño / desarrollador."
      icon="🤖"
      capabilities={[
        { icon: "💬", title: "Prompt playground", description: "Probar chat, embeddings, function calling contra distintos providers." },
        { icon: "🧮", title: "Cost tracker", description: "Tokens consumidos por experimento, estimación mensual." },
        { icon: "🔬", title: "Casos NEXARA", description: 'P.ej. "extraer cotización desde email", "categorizar tickets", "OCR ticket gasolina".' },
      ]}
      relatedLinks={[{ href: "/lab/health", label: "API health", icon: "❤️" }]}
    />
  );
}
