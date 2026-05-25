"use client";

import Link from "next/link";
import { useUser } from "@/components/UserContext";

export default function PeopleHome() {
  const { user } = useUser();

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #16a34a 0%, #0d9488 100%)", padding: 24, borderRadius: 14, color: "#fff" }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>👥 Hola, {user?.nombre?.split(" ")[0] || "equipo"}</h1>
        <p style={{ margin: 0, opacity: 0.92 }}>
          Aquí gestionas tu vida laboral: vacaciones, asistencia, nómina y datos del equipo.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 20 }}>
        <Card href="/people/my-vacation" icon="🏖️" title="Mis vacaciones" desc="Consulta tu saldo, solicita días y revisa el estado de aprobaciones." color="#16a34a" />
        <Card href="/people/my-attendance" icon="⏱️" title="Mi asistencia" desc="Revisa tus check-ins, retardos y horas extra del mes." color="#0ea5e9" />
        <Card href="/people/team" icon="👥" title="Mi equipo" desc="Directorio interno con contactos y áreas de cada compañero." color="#8b5cf6" />
        <Card href="/people/orgchart" icon="🗂️" title="Organigrama" desc="Cómo está estructurada la empresa por dirección y departamento." color="#f59e0b" />
      </div>

      <div style={{ marginTop: 24, padding: 16, background: "var(--bg-secondary)", borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>📩 Recursos</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
          <ResourceItem icon="📋" label="Manual del empleado" href="https://core.nexara.com.mx/kb" />
          <ResourceItem icon="🆘" label="Contactar RH" href="https://support.nexara.com.mx/new-ticket" />
          <ResourceItem icon="💵" label="Mis pagos" href="https://finance.nexara.com.mx/employee-payments" />
        </div>
      </div>
    </div>
  );
}

function Card({ href, icon, title, desc, color }: { href: string; icon: string; title: string; desc: string; color: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{ padding: 16, background: "var(--bg-primary)", border: "1px solid var(--border)", borderTop: `4px solid ${color}`, borderRadius: 12, cursor: "pointer" }}>
        <div style={{ fontSize: 32 }}>{icon}</div>
        <strong style={{ fontSize: 16, marginTop: 8, display: "block" }}>{title}</strong>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, marginBottom: 0 }}>{desc}</p>
      </div>
    </Link>
  );
}
function ResourceItem({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, background: "var(--bg-primary)", borderRadius: 8, textDecoration: "none", color: "var(--text-primary)", fontSize: 13 }}>
      <span>{icon}</span>
      <span>{label}</span>
    </a>
  );
}
