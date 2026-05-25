"use client";

import Link from "next/link";
import { useUser } from "@/components/UserContext";

export default function SupportHome() {
  const { user } = useUser();

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #dc2626 0%, #f97316 100%)", padding: 24, borderRadius: 14, color: "#fff" }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>🆘 Helpdesk Interno</h1>
        <p style={{ margin: 0, opacity: 0.92 }}>
          Hola {user?.nombre || "equipo"}. ¿Necesitas ayuda con IT, accesos, equipo o procesos internos? Levanta un ticket o consulta la base de conocimiento.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 20 }}>
        <Card href="/support/new-ticket" icon="📝" title="Levantar ticket" desc="Reporta problemas de IT, accesos, software, equipo o cualquier solicitud interna." color="#dc2626" />
        <Card href="/support/my-tickets" icon="🎟️" title="Mis tickets" desc="Da seguimiento al estado de tus solicitudes y comenta con el equipo de soporte." color="#0ea5e9" />
        <Card href="/support/kb" icon="📚" title="Base de conocimiento" desc="Artículos y procedimientos internos para resolver problemas frecuentes sin esperar." color="#16a34a" />
        <Card href="/support/sla" icon="📊" title="Métricas SLA" desc="Cumplimiento de tiempos de respuesta y resolución del equipo Helpdesk." color="#8b5cf6" />
      </div>

      <div style={{ marginTop: 24, padding: 16, background: "var(--bg-secondary)", borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>📞 Contacto rápido</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <Contact label="WhatsApp Helpdesk" value="+52 81 0000 0000" icon="💬" />
          <Contact label="Email" value="helpdesk@nexara.com.mx" icon="📧" />
          <Contact label="Horario" value="Lun–Vie 8:00–20:00" icon="🕐" />
        </div>
      </div>
    </div>
  );
}

function Card({ href, icon, title, desc, color }: { href: string; icon: string; title: string; desc: string; color: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div
        style={{
          padding: 16,
          background: "var(--bg-primary)",
          border: "1px solid var(--border)",
          borderTop: `4px solid ${color}`,
          borderRadius: 12,
          cursor: "pointer",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.1)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
      >
        <div style={{ fontSize: 32 }}>{icon}</div>
        <strong style={{ fontSize: 16, marginTop: 8, display: "block" }}>{title}</strong>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, marginBottom: 0 }}>{desc}</p>
      </div>
    </Link>
  );
}
function Contact({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div style={{ padding: 12, background: "var(--bg-primary)", borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{icon} {label}</div>
      <strong style={{ fontSize: 13, marginTop: 4, display: "block" }}>{value}</strong>
    </div>
  );
}
