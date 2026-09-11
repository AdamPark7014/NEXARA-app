"use client";

import { useMemo, useState } from "react";
import {
  ACCESS_TREE,
  panelHasAccess,
  summarizeModuleAccess,
  type AccessMode,
  type ModuleAccessMap,
} from "@/lib/access-tree";

type Props = {
  value: ModuleAccessMap | null;
  defaultModes: ModuleAccessMap;
  onChange: (next: ModuleAccessMap | null) => void;
  disabled?: boolean;
};

const PAIR_OPTS: { mode: AccessMode; label: string }[] = [
  { mode: "supervise", label: "Supervisa" },
  { mode: "deliver", label: "Entrega" },
  { mode: "both", label: "Ambas" },
  { mode: "off", label: "Off" },
];

export default function UserAccessTree({ value, defaultModes, onChange, disabled }: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(["ops", "crm"]));
  const usingTemplate = value == null;
  const effective = value ?? defaultModes;

  const summary = useMemo(() => summarizeModuleAccess(usingTemplate ? null : effective), [usingTemplate, effective]);

  function commit(next: ModuleAccessMap) {
    onChange(next);
  }

  function setMode(key: string, mode: AccessMode) {
    if (disabled) return;
    commit({ ...effective, [key]: mode });
  }

  function togglePanel(panelId: string, enable: boolean) {
    if (disabled) return;
    const panel = ACCESS_TREE.find((p) => p.id === panelId);
    if (!panel) return;
    const next = { ...effective };
    for (const mod of panel.modules) {
      if (!enable) next[mod.key] = "off";
      else next[mod.key] = defaultModes[mod.key] && defaultModes[mod.key] !== "off" ? defaultModes[mod.key] : mod.modeKind === "pair" ? "deliver" : "on";
    }
    commit(next);
  }

  function toggleOpen(panelId: string) {
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(panelId)) n.delete(panelId);
      else n.add(panelId);
      return n;
    });
  }

  const btn = (active: boolean): React.CSSProperties => ({
    padding: "4px 8px",
    fontSize: 11.5,
    borderRadius: 6,
    border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
    background: active ? "color-mix(in srgb, var(--primary) 16%, transparent)" : "var(--surface)",
    color: "var(--foreground)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: active ? 600 : 500,
  });

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 650, fontSize: 14 }}>Accesos por subplataforma</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary, var(--muted-foreground))" }}>
            {usingTemplate ? (
              <span>Plantilla del rol (sin ajustes personales). {summarizeModuleAccess(defaultModes)}</span>
            ) : (
              <span>{summary}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          disabled={disabled || usingTemplate}
          onClick={() => onChange(null)}
          style={{ ...btn(false), opacity: usingTemplate ? 0.5 : 1 }}
        >
          Usar solo plantilla del rol
        </button>
      </header>

      {usingTemplate && (
        <div style={{ fontSize: 12, padding: "8px 10px", borderRadius: 8, background: "var(--surface-2, #f1f5f9)", border: "1px solid var(--border)" }}>
          Al cambiar un módulo sales del modo plantilla y se guardará el ajuste en este usuario (sin crear un rol nuevo).
          El rol sigue siendo el techo: no se puede dar Contabilidad a quien el rol no la tiene.
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {ACCESS_TREE.map((panel) => {
          const isOpen = open.has(panel.id);
          const on = panelHasAccess(effective, panel.id);
          return (
            <div key={panel.id} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--surface)" }}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={disabled}
                  onChange={(e) => togglePanel(panel.id, e.target.checked)}
                  aria-label={`Panel ${panel.label}`}
                />
                <button
                  type="button"
                  onClick={() => toggleOpen(panel.id)}
                  style={{ flex: 1, textAlign: "left", background: "transparent", border: 0, cursor: "pointer", fontWeight: 600, fontSize: 13.5 }}
                >
                  {isOpen ? "▾" : "▸"} {panel.label}
                </button>
              </div>
              {isOpen && (
                <ul style={{ listStyle: "none", margin: 0, padding: "6px 10px 10px", display: "grid", gap: 8 }}>
                  {panel.modules.map((mod) => {
                    const mode = effective[mod.key] ?? "off";
                    return (
                      <li key={mod.key} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13 }}>{mod.label}</span>
                        {mod.modeKind === "pair" ? (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {PAIR_OPTS.map((o) => (
                              <button
                                key={o.mode}
                                type="button"
                                disabled={disabled}
                                aria-pressed={mode === o.mode}
                                onClick={() => setMode(mod.key, o.mode)}
                                style={btn(mode === o.mode)}
                              >
                                {o.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 4 }}>
                            <button type="button" disabled={disabled} aria-pressed={mode === "on"} onClick={() => setMode(mod.key, "on")} style={btn(mode === "on")}>
                              On
                            </button>
                            <button type="button" disabled={disabled} aria-pressed={mode === "off"} onClick={() => setMode(mod.key, "off")} style={btn(mode === "off")}>
                              Off
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
