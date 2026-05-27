"use client";

import ModuleStub from "@/components/ui/ModuleStub";

export default function RecruitingPage() {
  return (
    <ModuleStub
      eyebrow="OPS · Reclutamiento técnico"
      title="Reclutamiento técnico"
      description="CVs de candidatos a ingeniero de campo, NOC, soporte. Solo visible para directores y coordinadores."
      icon="📄"
      capabilities={[
        { icon: "🔍", title: "Filtrado por skill", description: "Cableado, CCTV, redes, POS, idiomas, licencia de conducir." },
        { icon: "📞", title: "Pipeline de contratación", description: "Postulado → Entrevista técnica → Entrevista admin → Oferta → Contratado." },
        { icon: "💼", title: "Banco de CVs", description: "Histórico de candidatos para futuras vacantes." },
        { icon: "🤝", title: "Handoff a RH", description: "Cuando se acepta, pasa automático a RH para alta y onboarding." },
      ]}
      relatedLinks={[
        { href: "/erp/hr", label: "RRHH (alta de personal)", icon: "👥" },
      ]}
    />
  );
}
