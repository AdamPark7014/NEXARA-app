"use client";

import Link from "next/link";

export default function LabHome() {
  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)", padding: 24, borderRadius: 14, color: "#fff" }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>🧪 Nexara Lab</h1>
        <p style={{ margin: 0, opacity: 0.92 }}>
          Sandbox interno para experimentar con IA, probar endpoints, gestionar feature flags y diagnosticar el sistema sin tocar producción.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 20 }}>
        <Card href="/lab/api-playground" icon="🧪" title="API Playground" desc="Ejecuta requests autenticados contra cualquier endpoint del ERP sin Postman." color="#8b5cf6" />
        <Card href="/lab/ai" icon="🤖" title="AI Sandbox" desc="Prueba prompts contra Claude/GPT y compara respuestas para casos del ERP." color="#ec4899" />
        <Card href="/lab/flags" icon="🚩" title="Feature Flags" desc="Activa/desactiva features experimentales por usuario, rol o subdominio." color="#0ea5e9" />
        <Card href="/lab/health" icon="📊" title="System Health" desc="Estado del API, base de datos, cron jobs, websockets y servicios externos." color="#16a34a" />
      </div>

      <div style={{ marginTop: 24, padding: 16, background: "#fef3c7", borderRadius: 12, color: "#78350f", fontSize: 13 }}>
        ⚠️ <strong>Solo super-admin / dev team:</strong> este panel permite acciones de bajo nivel. No comparta el acceso con usuarios finales o externos.
      </div>
    </div>
  );
}

function Card({ href, icon, title, desc, color }: { href: string; icon: string; title: string; desc: string; color: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{ padding: 16, background: "var(--bg-primary)", border: "1px solid var(--border)", borderTop: `4px solid ${color}`, borderRadius: 12 }}>
        <div style={{ fontSize: 32 }}>{icon}</div>
        <strong style={{ fontSize: 16, marginTop: 8, display: "block" }}>{title}</strong>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, marginBottom: 0 }}>{desc}</p>
      </div>
    </Link>
  );
}
