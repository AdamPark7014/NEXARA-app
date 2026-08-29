"use client";

import { DashPage, DashHero, DashEmpty } from "@/components/dashboard/DashKit";

export default function IntegraModuleStub({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <DashPage>
      <DashHero eyebrow={eyebrow} title={title} subtitle={subtitle} />
      <DashEmpty
        title="Módulo en construcción"
        description="Contrato Artemis definido en ADR-0017. La UI operativa llega por fases."
      />
    </DashPage>
  );
}
