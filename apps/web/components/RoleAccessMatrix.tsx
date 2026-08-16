"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "@/lib/api-base";

/**
 * Qué alcanza realmente cada rol.
 *
 * El acceso está repartido entre las banderas del rol, su plantilla, la matriz
 * de URLs y la lista de permisos. Sin esta vista no había forma de responder
 * "¿qué podrá hacer este rol?" sin asignárselo a alguien y esperar a que
 * chocara con un permiso denegado.
 */

type ModuleAccess = { module: string; scope: string; methods: string };

type RoleAccess = {
  id: number;
  nombre: string;
  orgRoleKey: string | null;
  nivelAutoridad: number;
  acceso: {
    resolvedRoleKey: string | null;
    recognizedByMatrix: boolean;
    isSuperAdmin: boolean;
    modules: ModuleAccess[];
    panels: string[];
  };
};

const SCOPE_LABEL: Record<string, string> = {
  read: "Consulta",
  write: "Edición",
  approve: "Aprobación",
  admin: "Administración",
};

const SCOPE_STYLE: Record<string, { bg: string; fg: string }> = {
  read: { bg: "var(--surface-2, #eef2f7)", fg: "var(--text-2, #475569)" },
  write: { bg: "#dbeafe", fg: "#1e40af" },
  approve: { bg: "#fef3c7", fg: "#92400e" },
  admin: { bg: "#dcfce7", fg: "#166534" },
};

export default function RoleAccessMatrix({ token }: { token?: string | null }) {
  const [roles, setRoles] = useState<RoleAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl("roles/access-matrix"), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      });
      if (!res.ok) throw new Error(`No se pudo cargar la matriz (${res.status})`);
      setRoles(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar la matriz de accesos");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Módulos presentes en algún rol, para la cabecera de la tabla. */
  const allModules = useMemo(() => {
    const set = new Set<string>();
    for (const role of roles) for (const m of role.acceso.modules) set.add(m.module);
    return [...set].sort();
  }, [roles]);

  const orphanRoles = roles.filter((r) => !r.acceso.recognizedByMatrix);

  if (loading) return <p style={{ color: "var(--text-2)" }}>Cargando matriz de accesos…</p>;
  if (error) return <p style={{ color: "var(--danger, #b91c1c)" }}>{error}</p>;

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <header>
        <h3 style={{ margin: 0 }}>Qué alcanza cada rol</h3>
        <p style={{ margin: "4px 0 0", color: "var(--text-2)", fontSize: 14 }}>
          Resuelto contra la matriz de permisos. Es lo que el sistema aplica de verdad,
          no lo que dicen las casillas del formulario.
        </p>
      </header>

      {orphanRoles.length > 0 && (
        <div
          role="alert"
          style={{
            padding: 12,
            borderRadius: 8,
            background: "#fef2f2",
            color: "#991b1b",
            fontSize: 14,
          }}
        >
          <strong>
            {orphanRoles.length} rol(es) sin plantilla reconocida:{" "}
            {orphanRoles.map((r) => r.nombre).join(", ")}.
          </strong>{" "}
          No tienen línea base de permisos; quien los use no podrá entrar a casi nada.
          Reasígnalos a una plantilla desde la edición del rol.
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px 12px", position: "sticky", left: 0, background: "var(--surface, #fff)" }}>
                Rol
              </th>
              {allModules.map((m) => (
                <th key={m} style={{ padding: "8px 6px", textAlign: "center", fontWeight: 500 }}>
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id} style={{ borderTop: "1px solid var(--border, #e2e8f0)" }}>
                <th
                  scope="row"
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    fontWeight: 600,
                    position: "sticky",
                    left: 0,
                    background: "var(--surface, #fff)",
                    whiteSpace: "nowrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === role.id ? null : role.id)}
                    style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer", textAlign: "left" }}
                    aria-expanded={expanded === role.id}
                  >
                    {role.nombre}
                  </button>
                  <div style={{ fontWeight: 400, fontSize: 11, color: "var(--text-2)" }}>
                    {role.acceso.isSuperAdmin
                      ? "acceso total"
                      : role.acceso.resolvedRoleKey ?? "sin plantilla"}
                  </div>
                </th>

                {allModules.map((m) => {
                  if (role.acceso.isSuperAdmin) {
                    const s = SCOPE_STYLE.admin;
                    return (
                      <td key={m} style={{ textAlign: "center", padding: "6px 4px" }}>
                        <span title="Acceso total" style={{ ...chip, background: s.bg, color: s.fg }}>
                          ★
                        </span>
                      </td>
                    );
                  }
                  const found = role.acceso.modules.find((x) => x.module === m);
                  if (!found) {
                    return (
                      <td key={m} style={{ textAlign: "center", padding: "6px 4px", color: "var(--text-3, #cbd5e1)" }}>
                        ·
                      </td>
                    );
                  }
                  const s = SCOPE_STYLE[found.scope] ?? SCOPE_STYLE.read;
                  return (
                    <td key={m} style={{ textAlign: "center", padding: "6px 4px" }}>
                      <span
                        title={`${SCOPE_LABEL[found.scope] ?? found.scope} · métodos: ${found.methods}`}
                        style={{ ...chip, background: s.bg, color: s.fg }}
                      >
                        {(SCOPE_LABEL[found.scope] ?? found.scope).charAt(0)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--text-2)" }}>
        {Object.entries(SCOPE_LABEL).map(([key, label]) => {
          const s = SCOPE_STYLE[key];
          return (
            <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ ...chip, background: s.bg, color: s.fg }}>{label.charAt(0)}</span>
              {label}
            </span>
          );
        })}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--text-3, #cbd5e1)" }}>·</span> Sin acceso
        </span>
      </footer>
    </section>
  );
}

const chip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 700,
};
