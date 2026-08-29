"use client";

import {
  DashPage,
  DashHero,
  DashGrid,
  DashCol,
  DashPanel,
  ListRow,
  DashPill,
} from "@/components/dashboard/DashKit";

const MODULES = [
  {
    href: "/integra/video",
    title: "Video",
    desc: "Live view, playback y capturas Artemis.",
    status: "próximo" as const,
  },
  {
    href: "/integra/access",
    title: "Control de acceso",
    desc: "Puertas, privilegios y apertura remota del sitio.",
    status: "próximo" as const,
  },
  {
    href: "/integra/people",
    title: "Personas",
    desc: "Organizaciones, credenciales y biometría en dispositivo.",
    status: "próximo" as const,
  },
  {
    href: "/integra/events",
    title: "Eventos y alarmas",
    desc: "ACS, VMS y vehículos en una sola bitácora.",
    status: "próximo" as const,
  },
  {
    href: "/integra/vehicles",
    title: "Vehículos",
    desc: "ANPR y listados Artemis de flota.",
    status: "próximo" as const,
  },
  {
    href: "/erp/facilities/access",
    title: "Oficinas NEXARA",
    desc: "ACS interno de sedes (Core ERP), no este panel.",
    status: "activo" as const,
  },
];

export default function IntegraHome() {
  return (
    <DashPage>
      <DashHero
        eyebrow="Seguridad física"
        title="NEXARA Integra"
        subtitle="Panel de seguridad física sobre HikCentral Professional (Artemis). Módulos CCTV y ACS del sitio."
      />

      <DashGrid>
        <DashCol span={12}>
          <DashPanel title="Módulos" subtitle="ADR-0017 · backend Artemis">
            {MODULES.map((m) => (
              <ListRow
                key={m.href}
                title={m.title}
                sub={m.desc}
                href={m.href}
                trail={
                  <DashPill tone={m.status === "activo" ? "positive" : "neutral"}>
                    {m.status}
                  </DashPill>
                }
              />
            ))}
          </DashPanel>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}
