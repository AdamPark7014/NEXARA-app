"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import { Tag, Money } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";

/**
 * Vista ejecutiva — pantalla home del CEO / Dueño.
 *
 * FIX HYDRATION: El servidor no tiene sessionStorage → user es null.
 * El cliente sí tiene la sesión del CEO → estructura diferente.
 * Sin `mounted` esto provoca un React hydration error en producción.
 * Solución: renderizar el mismo skeleton en server y en el primer
 * render del cliente; el contenido real aparece después del mount.
 */

type Alert = { icon: string; title: string; desc: string; href: string; urgency: "danger" | "warning"; cta: string };

export default function ExecutivePage() {
  const { token, user } = useUser();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Skeleton: mismo para servidor y primer render cliente (evita hydration mismatch)
  if (!mounted) {
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "grid",
          placeItems: "center",
          color: "var(--text-tertiary, #94a3b8)",
          fontSize: 14,
        }}
      >
        <span>Cargando vista ejecutiva…</span>
      </div>
    );
  }

  // ── Sin sesión → redirigir (AppShell ya lo hace, esto es fallback visual)
  if (!user || !token) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-secondary)" }}>
        <p style={{ fontWeight: 600 }}>Sesión no detectada. Redirigiendo a login…</p>
      </div>
    );
  }

  // ── Demo data estática (no fetch — evita dependencias de API en esta vista)
  const demoAlerts: Alert[] = [
    {
      icon: "🛡️",
      title: "3 aprobaciones esperando tu firma",
      desc: "OC Polos del Bienestar ($3.2M) · Cámaras Hikvision lote ($420k) · Renovación UDLA ($1.6M)",
      href: "/erp/approvals",
      urgency: "danger",
      cta: "Aprobar",
    },
    {
      icon: "💸",
      title: "Cobranza vencida supera $850k",
      desc: "TOKS Centro Histórico · Comercializadora Lima · Constructora Reyes (> 60 días)",
      href: "/erp/banking",
      urgency: "warning",
      cta: "Ver banca",
    },
  ];

  const shortcuts = [
    { href: "/erp/approvals", label: "Aprobaciones", icon: "🛡️", count: 3, accent: "#ef4444" },
    { href: "/erp/users", label: "Roles y accesos", icon: "🧑‍💼", accent: "#0ea5e9" },
    { href: "/erp/architecture", label: "Arquitectura", icon: "🗺️", accent: "#0ea5e9" },
    { href: "/erp/audit", label: "Audit log", icon: "🔍", accent: "#0ea5e9" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · CEO"
        title="Vista ejecutiva"
        subtitle={`Bienvenido, ${user.nombre || user.email} — Consolidando operaciones…`}
        variant="hero"
        meta={
          <>
            <Tag variant="positive" dot>Live</Tag>
            {demoAlerts.some((a) => a.urgency === "danger") && (
              <Tag variant="danger" dot>{demoAlerts.filter((a) => a.urgency === "danger").length} críticas</Tag>
            )}
          </>
        }
        actions={
          <>
            <Button variant="secondary" iconLeft="📥">
              Descargar reporte
            </Button>
            <Button variant="primary" iconLeft="📅" iconRight="→">
              Vista del mes
            </Button>
          </>
        }
      />

      <Section
        eyebrow="Mesa del CEO"
        title="Requiere tu atención"
        subtitle="Decisiones que solo tú puedes tomar — ordenadas por urgencia"
        tone="accent"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {demoAlerts.map((a, i) => {
            const color = a.urgency === "danger" ? "var(--danger)" : "var(--warning)";
            return (
              <Link
                key={i}
                href={a.href}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 16px 14px 20px",
                  background: `linear-gradient(135deg, color-mix(in srgb, ${color} 9%, var(--surface)) 0%, var(--surface) 70%)`,
                  border: `1px solid color-mix(in srgb, ${color} 32%, var(--border))`,
                  borderRadius: 14,
                  textDecoration: "none",
                  color: "var(--text-primary)",
                  boxShadow: "var(--nx-panel-elev-1)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 12,
                    bottom: 12,
                    width: 3,
                    borderRadius: "0 3px 3px 0",
                    background: color,
                  }}
                />
                <span
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: `color-mix(in srgb, ${color} 16%, var(--surface))`,
                    border: `1px solid color-mix(in srgb, ${color} 28%, var(--border))`,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    flexShrink: 0,
                  }}
                >
                  {a.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: 5,
                      display: "inline-block",
                      marginBottom: 3,
                      background: `color-mix(in srgb, ${color} 16%, transparent)`,
                      color,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {a.urgency === "danger" ? "Crítico" : "Importante"}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.45 }}>{a.desc}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color, whiteSpace: "nowrap" }}>
                  {a.cta} →
                </span>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section
        eyebrow="$"
        title="KPIs operativos demo"
        subtitle="Montos estimados — conecta API para datos en vivo"
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <KpiCard
            label="Ingresos del mes"
            value={<Money value={4820000} compact />}
            hint="vs $4.1M mes pasado"
            trend={{ direction: "up", value: "+17.5%" }}
            variant="positive"
            icon="💰"
          />
          <KpiCard
            label="Pipeline activo"
            value={<Money value={8420000} compact />}
            hint="9 oportunidades en curso"
            variant="accent"
            icon="🎯"
          />
          <KpiCard
            label="Saldo en bancos"
            value={<Money value={2410000} compact />}
            hint="3 cuentas operativas"
            icon="🏦"
          />
          <KpiCard
            label="Cuentas por cobrar"
            value={<Money value={852000} compact />}
            hint="3 clientes > 60 días"
            variant="warning"
            icon="⏳"
          />
        </div>
      </Section>

      <Section eyebrow="Saltos" title="Atajos rápidos" subtitle="Lo que más usas — un clic">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {shortcuts.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              style={{
                position: "relative",
                padding: "14px 14px",
                background: "var(--surface)",
                border: "1px solid var(--nx-panel-hairline)",
                borderRadius: 12,
                textDecoration: "none",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                boxShadow: "var(--nx-panel-elev-1)",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: `color-mix(in srgb, ${a.accent} 14%, var(--surface))`,
                  color: a.accent,
                  border: `1px solid color-mix(in srgb, ${a.accent} 22%, var(--border))`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 17,
                  flexShrink: 0,
                }}
              >
                {a.icon}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{a.label}</span>
              {a.count != null && <Tag variant="danger" size="sm">{a.count}</Tag>}
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
