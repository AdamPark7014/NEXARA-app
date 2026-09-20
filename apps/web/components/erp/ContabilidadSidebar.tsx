"use client";

import { usePathname } from "next/navigation";
import CrossPanelLink from "@/components/CrossPanelLink";

type NavItem = { id: string; label: string; href: string; exact?: boolean };
type NavGroup = { id: string; label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    id: "resumen",
    label: "Contabilidad",
    items: [{ id: "home", label: "Resumen", href: "/erp/contabilidad", exact: true }],
  },
  {
    id: "finanzas",
    label: "Finanzas",
    items: [
      { id: "movimientos", label: "Movimientos", href: "/erp/contabilidad/movimientos" },
      { id: "cxc", label: "Por cobrar", href: "/erp/contabilidad/cuentas-por-cobrar" },
      { id: "cxp", label: "Por pagar", href: "/erp/contabilidad/cuentas-por-pagar" },
      { id: "conciliacion", label: "Conciliación", href: "/erp/contabilidad/conciliacion" },
    ],
  },
  {
    id: "docs",
    label: "Documentos",
    items: [
      { id: "facturas", label: "Facturas", href: "/erp/contabilidad/facturas" },
      { id: "proveedores", label: "Proveedores", href: "/erp/contabilidad/proveedores" },
    ],
  },
  {
    id: "nomina",
    label: "Nómina",
    items: [
      { id: "prenomina", label: "Pre-nómina", href: "/erp/contabilidad/pre-nomina" },
      { id: "pagos", label: "Pagos al personal", href: "/erp/finance/employee-payments" },
    ],
  },
  {
    id: "ops",
    label: "Operación",
    items: [
      { id: "proyectos", label: "Proyectos", href: "/erp/contabilidad/proyectos" },
      { id: "presupuestos", label: "Presupuestos", href: "/erp/contabilidad/presupuestos" },
    ],
  },
  {
    id: "analisis",
    label: "Análisis",
    items: [{ id: "reportes", label: "Reportes", href: "/erp/contabilidad/reportes" }],
  },
  {
    id: "control",
    label: "Control",
    items: [
      { id: "cierres", label: "Cierres", href: "/erp/contabilidad/cierres" },
      { id: "auditoria", label: "Auditoría", href: "/erp/contabilidad/auditoria" },
    ],
  },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href || pathname === `${item.href}/`;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Subnavegación del hub Contadora.
 * Agrupada por tarea (no por tabla BD). Compacta; en móvil hace scroll horizontal por grupo.
 */
export default function ContabilidadSidebar() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Módulos de contabilidad"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        paddingBottom: 4,
        borderBottom: "1px solid var(--nx-panel-hairline)",
        marginBottom: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px 20px",
          alignItems: "flex-start",
        }}
      >
        {GROUPS.map((group) => (
          <div key={group.id} style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-tertiary)",
                marginBottom: 6,
              }}
            >
              {group.label}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <CrossPanelLink
                    key={item.id}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "5px 10px",
                      borderRadius: 7,
                      fontSize: 12.5,
                      fontWeight: active ? 700 : 500,
                      textDecoration: "none",
                      color: active ? "var(--text-primary)" : "var(--text-secondary)",
                      background: active
                        ? "color-mix(in srgb, var(--primary) 10%, var(--surface))"
                        : "transparent",
                      border: active
                        ? "1px solid color-mix(in srgb, var(--primary) 28%, var(--border))"
                        : "1px solid transparent",
                    }}
                  >
                    {item.label}
                  </CrossPanelLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
