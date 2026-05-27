"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { Tag } from "@/components/ui/DataTable";

const NOTIFS = [
  { icon: "🛡️", title: "Aprobación pendiente: OC Hikvision $276k", time: "Hace 10 min", channel: "Sistema", read: false },
  { icon: "📸", title: "Brandon C. subió evidencia para OT-3421", time: "Hace 1h", channel: "OPS", read: false },
  { icon: "🧾", title: "CFDI F-2026-0421 timbrado correctamente", time: "Hace 2h", channel: "Finanzas", read: true },
  { icon: "🚨", title: "Sitio Constructora Reyes caído >18h (NOC)", time: "Hace 3h", channel: "NOC", read: false },
  { icon: "💸", title: "Karla R. solicitó tu firma para dispersión nómina", time: "Hace 4h", channel: "Finanzas", read: true },
  { icon: "✨", title: "Nuevo lead vía sitio web: Familia Garza (CCTV residencial)", time: "Ayer", channel: "CRM", read: true },
];

export default function NotificationsCenterPage() {
  return (
    <>
      <PageHeader
        eyebrow="ERP · Auditoría"
        title="Centro de notificaciones"
        subtitle="Todo lo que el sistema y los compañeros te están avisando, en un solo lugar."
      />

      <Section title={`${NOTIFS.filter(n => !n.read).length} sin leer`} subtitle="Notificaciones recientes">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {NOTIFS.map((n, i) => (
            <article
              key={i}
              style={{
                display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center",
                padding: 14,
                background: !n.read ? "color-mix(in srgb, var(--primary) 5%, transparent)" : "var(--surface)",
                border: "1px solid var(--border)",
                borderLeft: !n.read ? "3px solid var(--primary)" : "1px solid var(--border)",
                borderRadius: 12,
              }}
            >
              <span style={{ fontSize: 22 }}>{n.icon}</span>
              <div>
                <div style={{ fontWeight: !n.read ? 700 : 500, fontSize: 13 }}>{n.title}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 3 }}>
                  {n.time} · <Tag variant="neutral">{n.channel}</Tag>
                </div>
              </div>
              {!n.read && <Tag variant="accent">NUEVO</Tag>}
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}
