"use client";

import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { MODULES } from "@/lib/access-matrix";
import { CORE_SURFACE_ONLY } from "@/lib/core-surface";
import { getModuleGuide, resolveModuleIdFromPath } from "@/lib/module-guides";

/**
 * Guía detallada del módulo actual — solo fuera de producción (capacitación).
 * Oculta en Core ola1: la pizarra y menú deben verse limpios.
 */
export default function ModuleGuideBanner() {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);

  const moduleId = useMemo(
    () => resolveModuleIdFromPath(pathname || "/"),
    [pathname],
  );
  const guide = moduleId ? getModuleGuide(moduleId) : null;
  const entry = moduleId ? MODULES[moduleId] : null;

  if (CORE_SURFACE_ONLY) return null;
  if (process.env.NODE_ENV === "production") return null;
  if (!moduleId || !guide || !entry) return null;

  return (
    <aside
      style={{
        marginBottom: 16,
        padding: "12px 14px",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 12,
      }}
      aria-label={`Guía del módulo ${entry.label}`}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-tertiary)",
              marginBottom: 4,
            }}
          >
            Guía · no producción
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text-primary)",
              fontFamily: "var(--nx-font-display)",
            }}
          >
            <span style={{ marginRight: 8 }}>{entry.icon}</span>
            {entry.label}
          </div>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.45,
            }}
          >
            {guide.summary}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            flexShrink: 0,
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: "pointer",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text-primary)",
          }}
        >
          {open ? "Ocultar" : "Cómo funciona"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>
          <p style={{ margin: "0 0 8px" }}>
            <strong style={{ color: "var(--text-primary)" }}>Quién lo usa:</strong> {guide.audience}
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong style={{ color: "var(--text-primary)" }}>Cómo funciona:</strong> {guide.how}
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong style={{ color: "var(--text-primary)" }}>Pasos:</strong>
          </p>
          <ol style={{ margin: "0 0 8px", paddingLeft: 18 }}>
            {guide.steps.map((step) => (
              <li key={step} style={{ marginBottom: 4 }}>
                {step}
              </li>
            ))}
          </ol>
          <p style={{ margin: 0 }}>
            <strong style={{ color: "var(--text-primary)" }}>Se conecta con:</strong> {guide.connects}
          </p>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 11,
              color: "var(--text-tertiary)",
            }}
          >
            Texto de capacitación temporal. En producción este bloque no se muestra.
          </p>
        </div>
      )}
    </aside>
  );
}
