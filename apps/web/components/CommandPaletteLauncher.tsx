"use client";

/**
 * CommandPaletteLauncher — botón "Buscar (Ctrl K)" en el topbar de cada panel.
 *
 * Comportamiento:
 *  - Click abre la paleta de comandos.
 *  - Atajo global Cmd+K (macOS) / Ctrl+K (Windows/Linux) abre/cierra la paleta
 *    desde cualquier parte del panel — ignora si el foco está en un input
 *    SOLO si no es un textarea/contenteditable (deja escribir Ctrl+K normal en
 *    editores ricos). Por convención del producto preferimos siempre abrir.
 */

import { useCallback, useEffect, useState } from "react";
import CommandPalette from "@/components/CommandPalette";

type Props = {
  accentColor?: string;
  compact?: boolean;
};

export default function CommandPaletteLauncher({ accentColor = "#0ea5e9", compact = false }: Props) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isShortcut = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (isShortcut) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label="Abrir paleta de comandos (Ctrl+K)"
        title="Buscar (Ctrl K)"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: compact ? "6px 8px" : "6px 12px",
          background: "var(--surface, var(--bg-secondary, #f9fafb))",
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: 10,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-secondary, #6b7280)",
          transition: "border-color 0.15s, color 0.15s",
          minWidth: compact ? 0 : 160,
          justifyContent: "space-between",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = accentColor;
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary, #111)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border, #e5e7eb)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary, #6b7280)";
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>🔍</span>
          {!compact && <span>Buscar…</span>}
        </span>
        {!compact && (
          <kbd
            style={{
              fontSize: 10,
              padding: "2px 5px",
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: 3,
              color: "var(--text-secondary, #9ca3af)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
              background: "var(--bg-primary, #fff)",
            }}
          >
            Ctrl K
          </kbd>
        )}
      </button>
      <CommandPalette open={open} onClose={close} accentColor={accentColor} />
    </>
  );
}
