"use client";

import Link from "next/link";
import { ReactNode } from "react";
import PageHeader from "./PageHeader";
import Section from "./Section";
import Button from "./Button";

/**
 * NEXARA · ModuleStub (premium)
 * Placeholder narrativo y elegante para módulos que aún no tienen UI
 * custom. Comunica:
 *  - Estado "en construcción" con un badge sutil (no infantil)
 *  - Qué capacidades vivirán aquí
 *  - Atajos a módulos upstream/downstream para que el usuario no se
 *    sienta perdido
 *  - Una imagen mental clara: 3 cards de capacidades con icono
 *    chip + roadmap visual a la derecha en pantallas grandes
 */
export default function ModuleStub({
  eyebrow,
  title,
  description,
  capabilities,
  relatedLinks,
  primaryAction,
  icon = "🚧",
  status = "En diseño",
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  capabilities: { icon: ReactNode; title: ReactNode; description: ReactNode }[];
  relatedLinks?: { href: string; label: string; icon: string }[];
  primaryAction?: { href: string; label: string; icon?: string };
  icon?: ReactNode;
  status?: string;
}) {
  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={description}
        variant="hero"
        meta={
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: "color-mix(in srgb, var(--warning) 14%, transparent)",
              color: "var(--state-warning-text)",
              border: "1px solid color-mix(in srgb, var(--warning) 32%, var(--border))",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--warning)",
                boxShadow: "0 0 0 3px color-mix(in srgb, var(--warning) 22%, transparent)",
              }}
            />
            {status}
          </span>
        }
        actions={
          primaryAction ? (
            <Link href={primaryAction.href} style={{ textDecoration: "none" }}>
              <Button variant="primary" iconRight="→">
                {primaryAction.label}
              </Button>
            </Link>
          ) : null
        }
      />

      <Section
        eyebrow="Roadmap del módulo"
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <span>Lo que vivirá aquí</span>
          </span>
        }
        subtitle="Capacidades planeadas — el módulo se conecta a la matriz de acceso por rol y al motor de aprobaciones de NEXARA."
        tone="accent"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {capabilities.map((c, i) => (
            <div
              key={i}
              style={{
                position: "relative",
                padding: 18,
                background: "var(--surface)",
                border: "1px solid var(--nx-panel-hairline)",
                borderRadius: "var(--nx-panel-radius-sm)",
                boxShadow: "var(--nx-panel-elev-1)",
                transition: "transform 200ms var(--nx-ease-out), box-shadow 200ms var(--nx-ease-out)",
              }}
              className="nx-cap"
            >
              <div
                style={{
                  fontSize: 18,
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  background:
                    "linear-gradient(160deg, color-mix(in srgb, var(--primary) 18%, var(--surface)) 0%, color-mix(in srgb, var(--primary) 8%, var(--surface)) 100%)",
                  color: "var(--primary)",
                  border: "1px solid color-mix(in srgb, var(--primary) 22%, var(--border))",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                }}
              >
                {c.icon}
              </div>
              <div
                style={{
                  fontFamily: "var(--nx-font-display)",
                  fontSize: 14.5,
                  fontWeight: 700,
                  marginBottom: 6,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.005em",
                }}
              >
                {c.title}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                {c.description}
              </div>
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 14,
                  right: 14,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  color: "var(--text-tertiary)",
                  opacity: 0.55,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {relatedLinks && relatedLinks.length > 0 && (
        <Section
          eyebrow="Atajos"
          title="Mientras tanto, te puede interesar"
          subtitle="Módulos relacionados que ya están operativos en tu panel"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 10,
            }}
          >
            {relatedLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="nx-related"
                style={{
                  padding: "14px 16px",
                  background: "var(--surface)",
                  border: "1px solid var(--nx-panel-hairline)",
                  borderRadius: "var(--nx-panel-radius-sm)",
                  textDecoration: "none",
                  color: "var(--text-primary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  transition:
                    "transform 180ms var(--nx-ease-out), border-color 180ms var(--nx-ease-out), box-shadow 180ms var(--nx-ease-out)",
                }}
              >
                <span
                  style={{
                    fontSize: 18,
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                    color: "var(--primary)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {l.icon}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>{l.label}</span>
                <span style={{ color: "var(--text-tertiary)", fontSize: 16, transition: "transform 200ms" }} className="nx-arrow">
                  →
                </span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <style jsx>{`
        :global(.nx-cap:hover) {
          transform: translateY(-2px);
          box-shadow: var(--nx-panel-elev-hover);
          border-color: color-mix(in srgb, var(--primary) 32%, var(--border));
        }
        :global(.nx-related:hover) {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--primary) 38%, var(--border));
          box-shadow: var(--nx-panel-elev-2);
        }
        :global(.nx-related:hover .nx-arrow) {
          transform: translateX(3px);
          color: var(--primary) !important;
        }
      `}</style>
    </>
  );
}
