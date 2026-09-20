"use client";

import { usePathname } from "next/navigation";
import CrossPanelLink from "@/components/CrossPanelLink";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS, hasAnyPermission, type UserPermissions } from "@/lib/permissions";

/**
 * Menú del escritorio Contabilidad, en lenguaje de tareas (no de contador).
 *
 * Primario: lo que alguien hace un martes por la mañana — mirar, cobrar, pagar,
 * cuadrar banco, facturas, entradas/salidas. El resto vive en «Más opciones»
 * para no bombardear con pólizas, auditorías y cierres a quien solo viene a
 * cobrar una factura.
 *
 * Las rutas y permisos no cambian: solo las etiquetas y el orden visual.
 */
type NavItem = { id: string; label: string; href: string; exact?: boolean; permissions: string[] };
type NavGroup = { id: string; label: string; items: NavItem[] };

const VER_CONTABILIDAD: string[] = [PERMISSIONS.CONTABILIDAD_VIEW, PERMISSIONS.ACCOUNTING_VIEW];
const VER_FACTURACION: string[] = [
  PERMISSIONS.INVOICING_VIEW,
  PERMISSIONS.ACCOUNTING_VIEW,
  PERMISSIONS.CONTABILIDAD_VIEW,
];
const VER_BANCOS: string[] = [PERMISSIONS.BANKING_VIEW, PERMISSIONS.BANKING_RECONCILE];
const VER_NOMINA: string[] = [
  PERMISSIONS.CONTABILIDAD_VIEW,
  PERMISSIONS.CONTABILIDAD_MANAGE,
  PERMISSIONS.HR_VIEW,
  PERMISSIONS.HR_MANAGE,
];
const CERRAR_PERIODO: string[] = [
  PERMISSIONS.ACCOUNTING_CLOSE_PERIOD,
  PERMISSIONS.ACCOUNTING_MANAGE,
];
const VER_AUDITORIA: string[] = [PERMISSIONS.AUDIT_VIEW];

/** Lo que se ve siempre: tareas del día en lenguaje llano. */
const PRIMARY_IDS = new Set([
  "home",
  "cxc",
  "cxp",
  "conciliacion",
  "facturas",
  "movimientos",
]);

export const GRUPOS_CONTABILIDAD: NavGroup[] = [
  {
    id: "dia",
    label: "Hoy",
    items: [
      {
        id: "home",
        label: "Inicio",
        href: "/erp/contabilidad",
        exact: true,
        permissions: VER_CONTABILIDAD,
      },
      {
        id: "cxc",
        label: "Me deben",
        href: "/erp/contabilidad/cuentas-por-cobrar",
        permissions: VER_FACTURACION,
      },
      {
        id: "cxp",
        label: "Debo pagar",
        href: "/erp/contabilidad/cuentas-por-pagar",
        permissions: VER_FACTURACION,
      },
      {
        id: "conciliacion",
        label: "Cuadrar banco",
        href: "/erp/contabilidad/conciliacion",
        permissions: VER_BANCOS,
      },
      {
        id: "facturas",
        label: "Facturas",
        href: "/erp/contabilidad/facturas",
        permissions: VER_FACTURACION,
      },
      {
        id: "movimientos",
        label: "Entradas y salidas",
        href: "/erp/contabilidad/movimientos",
        permissions: VER_CONTABILIDAD,
      },
    ],
  },
  {
    id: "mas",
    label: "Más opciones",
    items: [
      {
        id: "polizas",
        label: "Cuentas y asientos",
        href: "/erp/contabilidad/polizas",
        permissions: VER_CONTABILIDAD,
      },
      {
        id: "proveedores",
        label: "Proveedores",
        href: "/erp/contabilidad/proveedores",
        permissions: VER_FACTURACION,
      },
      {
        id: "prenomina",
        label: "Pago al personal",
        href: "/erp/contabilidad/pre-nomina",
        permissions: VER_NOMINA,
      },
      {
        id: "proyectos",
        label: "Costos por proyecto",
        href: "/erp/contabilidad/proyectos",
        permissions: VER_CONTABILIDAD,
      },
      {
        id: "presupuestos",
        label: "Presupuestos",
        href: "/erp/contabilidad/presupuestos",
        permissions: VER_CONTABILIDAD,
      },
      {
        id: "reportes",
        label: "Informes",
        href: "/erp/contabilidad/reportes",
        permissions: VER_CONTABILIDAD,
      },
      {
        id: "cierres",
        label: "Cerrar el mes",
        href: "/erp/contabilidad/cierres",
        permissions: CERRAR_PERIODO,
      },
      {
        id: "auditoria",
        label: "Quién cambió qué",
        href: "/erp/contabilidad/auditoria",
        permissions: VER_AUDITORIA,
      },
    ],
  },
];

export function filtrarGruposContabilidad(
  user: UserPermissions | null | undefined,
): NavGroup[] {
  return GRUPOS_CONTABILIDAD.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasAnyPermission(user, item.permissions)),
  })).filter((group) => group.items.length > 0);
}

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href || pathname === `${item.href}/`;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavChip({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item);
  return (
    <CrossPanelLink
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="nx-contab-nav-link"
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 30,
        padding: "0 12px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        lineHeight: 1,
        whiteSpace: "nowrap",
        textDecoration: "none",
        color: active ? "var(--primary)" : "var(--text-secondary)",
        background: active
          ? "color-mix(in srgb, var(--primary) 10%, transparent)"
          : "transparent",
      }}
    >
      {item.label}
    </CrossPanelLink>
  );
}

export default function ContabilidadSidebar() {
  const pathname = usePathname() ?? "";
  const { user } = useUser();
  const items = filtrarGruposContabilidad(user).flatMap((g) => g.items);
  if (items.length === 0) return null;

  const primary = items.filter((i) => PRIMARY_IDS.has(i.id));
  const more = items.filter((i) => !PRIMARY_IDS.has(i.id));
  const moreActive = more.some((i) => isActive(pathname, i));

  return (
    <nav
      aria-label="Qué quieres hacer en dinero"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        alignItems: "center",
        paddingBottom: 12,
        borderBottom: "1px solid var(--nx-panel-hairline, var(--border))",
        marginBottom: 8,
      }}
    >
      {primary.map((item) => (
        <NavChip key={item.id} item={item} pathname={pathname} />
      ))}

      {more.length > 0 ? (
        <details
          open={moreActive || undefined}
          style={{ display: "inline-flex", alignItems: "center" }}
        >
          <summary
            style={{
              listStyle: "none",
              cursor: "pointer",
              height: 30,
              padding: "0 12px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-tertiary)",
              display: "inline-flex",
              alignItems: "center",
              userSelect: "none",
            }}
          >
            Más opciones
          </summary>
          <div
            style={{
              display: "inline-flex",
              flexWrap: "wrap",
              gap: 4,
              marginLeft: 4,
              alignItems: "center",
            }}
          >
            {more.map((item) => (
              <NavChip key={item.id} item={item} pathname={pathname} />
            ))}
          </div>
        </details>
      ) : null}

      <style>{`
        .nx-contab-nav-link:hover {
          background: color-mix(in srgb, var(--text-primary) 6%, transparent);
          color: var(--text-primary);
        }
        .nx-contab-nav-link[aria-current="page"]:hover {
          background: color-mix(in srgb, var(--primary) 14%, transparent);
          color: var(--primary);
        }
        .nx-contab-nav-link:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 1px;
          color: var(--text-primary);
        }
        nav[aria-label="Qué quieres hacer en dinero"] details > summary::-webkit-details-marker {
          display: none;
        }
        nav[aria-label="Qué quieres hacer en dinero"] details > summary:hover {
          color: var(--text-primary);
          background: color-mix(in srgb, var(--text-primary) 5%, transparent);
        }
      `}</style>
    </nav>
  );
}
