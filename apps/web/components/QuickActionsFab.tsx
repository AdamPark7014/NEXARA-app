"use client";

/**
 * QuickActionsFab — Floating Action Button con acciones contextuales.
 *
 * Permite mostrar 1–6 atajos rápidos sin desordenar el header.
 * Se expande al hacer click y se contrae con click fuera o Escape.
 *
 * Uso:
 *   <QuickActionsFab
 *     actions={[
 *       { id: "nuevo", label: "Nuevo ticket", icon: "📝", onClick: () => router.push("/new") },
 *       { id: "pal", label: "Buscar", icon: "🔍", onClick: openCommandPalette, shortcut: "Cmd+K" },
 *     ]}
 *   />
 *
 * También expone la prop `position` por si se desea moverlo de esquina.
 */

import { useEffect, useRef, useState } from "react";

export type QuickAction = {
  id: string;
  label: string;
  icon: string;
  onClick: () => void;
  shortcut?: string;
  tone?: "primary" | "neutral" | "success" | "danger";
};

type QuickActionsFabProps = {
  actions: QuickAction[];
  position?: "bottom-right" | "bottom-left";
  mainIcon?: string;
  mainLabel?: string;
};

const TONE_BG: Record<string, string> = {
  primary: "var(--primary, #0ea5e9)",
  neutral: "var(--bg-secondary)",
  success: "#16a34a",
  danger: "#dc2626",
};

export default function QuickActionsFab({
  actions,
  position = "bottom-right",
  mainIcon = "⚡",
  mainLabel = "Acciones rápidas",
}: QuickActionsFabProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  if (actions.length === 0) return null;

  const positionStyle: React.CSSProperties = position === "bottom-left"
    ? { left: 24, right: "auto" }
    : { right: 24, left: "auto" };

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        bottom: 24,
        ...positionStyle,
        zIndex: 90,
        display: "flex",
        flexDirection: "column",
        alignItems: position === "bottom-left" ? "flex-start" : "flex-end",
        gap: 10,
      }}
    >
      {open && (
        <div
          role="menu"
          aria-label={mainLabel}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: position === "bottom-left" ? "flex-start" : "flex-end",
            gap: 8,
          }}
        >
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                a.onClick();
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                background: TONE_BG[a.tone || "primary"],
                color: (a.tone || "primary") === "neutral" ? "var(--text-primary)" : "#fff",
                border: (a.tone || "primary") === "neutral" ? "1px solid var(--border)" : "none",
                borderRadius: 24,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
                transition: "transform 0.12s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.transform = "translateX(-2px) scale(1.02)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.transform = "none")}
            >
              <span style={{ fontSize: 16 }}>{a.icon}</span>
              <span>{a.label}</span>
              {a.shortcut && (
                <kbd
                  style={{
                    padding: "2px 6px",
                    background: "rgba(255,255,255,0.18)",
                    borderRadius: 4,
                    fontSize: 10,
                    fontFamily: "monospace",
                  }}
                >
                  {a.shortcut}
                </kbd>
              )}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        aria-label={mainLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: open ? "var(--bg-secondary)" : "var(--primary, #0ea5e9)",
          color: open ? "var(--text-primary)" : "#fff",
          border: open ? "1px solid var(--border)" : "none",
          fontSize: 22,
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
          transition: "transform 0.18s, background 0.12s",
          transform: open ? "rotate(45deg)" : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title={mainLabel}
      >
        {open ? "✕" : mainIcon}
      </button>
    </div>
  );
}
