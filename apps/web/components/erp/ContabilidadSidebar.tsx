"use client";

import { usePathname } from "next/navigation";
import CrossPanelLink from "@/components/CrossPanelLink";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS, hasAnyPermission, type UserPermissions } from "@/lib/permissions";

/**
 * `permissions`: basta UNO para ver la entrada. Son los MISMOS permisos que exigen los
 * controladores detrás de cada página, para que el menú no ofrezca puertas que el backend
 * cierra con 403. Esconder el enlace no es la protección —esa vive en la API— pero sí evita
 * enseñarle a la contadora módulos que no son suyos.
 */
type NavItem = { id: string; label: string; href: string; exact?: boolean; permissions: string[] };
type NavGroup = { id: string; label: string; items: NavItem[] };

/** El hub y sus listados de dinero. */
const VER_CONTABILIDAD: string[] = [PERMISSIONS.CONTABILIDAD_VIEW, PERMISSIONS.ACCOUNTING_VIEW];
/** Documentos fiscales: facturas emitidas y recibidas, CxC y CxP. */
const VER_FACTURACION: string[] = [
  PERMISSIONS.INVOICING_VIEW,
  PERMISSIONS.ACCOUNTING_VIEW,
  PERMISSIONS.CONTABILIDAD_VIEW,
];
/** Bancos y conciliación. */
const VER_BANCOS: string[] = [PERMISSIONS.BANKING_VIEW, PERMISSIONS.BANKING_RECONCILE];
/** Nómina operativa: `employee-payments` acepta contabilidad o RH. */
const VER_NOMINA: string[] = [
  PERMISSIONS.CONTABILIDAD_VIEW,
  PERMISSIONS.CONTABILIDAD_MANAGE,
  PERMISSIONS.HR_VIEW,
  PERMISSIONS.HR_MANAGE,
];
/** Cerrar o reabrir un periodo no es lectura. */
const CERRAR_PERIODO: string[] = [
  PERMISSIONS.ACCOUNTING_CLOSE_PERIOD,
  PERMISSIONS.ACCOUNTING_MANAGE,
];
/** La bitácora sale de `GET /api/audit`, que exige `audit.view` (dirección y gobierno). */
const VER_AUDITORIA: string[] = [PERMISSIONS.AUDIT_VIEW];

export const GRUPOS_CONTABILIDAD: NavGroup[] = [
  {
    id: "resumen",
    label: "Contabilidad",
    items: [
      {
        id: "home",
        label: "Resumen",
        href: "/erp/contabilidad",
        exact: true,
        permissions: VER_CONTABILIDAD,
      },
    ],
  },
  {
    id: "finanzas",
    label: "Finanzas",
    items: [
      {
        id: "movimientos",
        label: "Movimientos",
        href: "/erp/contabilidad/movimientos",
        permissions: VER_CONTABILIDAD,
      },
      {
        id: "polizas",
        label: "Pólizas y cuentas",
        href: "/erp/contabilidad/polizas",
        permissions: VER_CONTABILIDAD,
      },
      {
        id: "cxc",
        label: "Por cobrar",
        href: "/erp/contabilidad/cuentas-por-cobrar",
        permissions: VER_FACTURACION,
      },
      {
        id: "cxp",
        label: "Por pagar",
        href: "/erp/contabilidad/cuentas-por-pagar",
        permissions: VER_FACTURACION,
      },
      {
        id: "conciliacion",
        label: "Conciliación",
        href: "/erp/contabilidad/conciliacion",
        permissions: VER_BANCOS,
      },
    ],
  },
  {
    id: "docs",
    label: "Documentos",
    items: [
      {
        id: "facturas",
        label: "Facturas",
        href: "/erp/contabilidad/facturas",
        permissions: VER_FACTURACION,
      },
      {
        id: "proveedores",
        label: "Proveedores",
        href: "/erp/contabilidad/proveedores",
        permissions: VER_FACTURACION,
      },
    ],
  },
  {
    id: "nomina",
    label: "Nómina",
    items: [
      {
        id: "prenomina",
        label: "Pre-nómina",
        href: "/erp/contabilidad/pre-nomina",
        permissions: VER_NOMINA,
      },
    ],
  },
  {
    id: "ops",
    label: "Operación",
    items: [
      {
        id: "proyectos",
        label: "Proyectos",
        href: "/erp/contabilidad/proyectos",
        permissions: VER_CONTABILIDAD,
      },
      {
        id: "presupuestos",
        label: "Presupuestos",
        href: "/erp/contabilidad/presupuestos",
        permissions: VER_CONTABILIDAD,
      },
    ],
  },
  {
    id: "analisis",
    label: "Análisis",
    items: [
      {
        id: "reportes",
        label: "Reportes",
        href: "/erp/contabilidad/reportes",
        permissions: VER_CONTABILIDAD,
      },
    ],
  },
  {
    id: "control",
    label: "Control",
    items: [
      {
        id: "cierres",
        label: "Cierres",
        href: "/erp/contabilidad/cierres",
        permissions: CERRAR_PERIODO,
      },
      {
        id: "auditoria",
        label: "Auditoría",
        href: "/erp/contabilidad/auditoria",
        permissions: VER_AUDITORIA,
      },
    ],
  },
];

/**
 * Deja solo lo que el usuario puede abrir de verdad, y tira los grupos que se quedan vacíos
 * (para que no aparezca el encabezado "Control" sin nada debajo).
 */
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

/**
 * Barra de secciones del escritorio de contabilidad.
 *
 * Antes eran siete grupos con su título —CONTABILIDAD, FINANZAS, DOCUMENTOS,
 * NÓMINA, OPERACIÓN, ANÁLISIS, CONTROL— desparramados en dos filas. Para
 * navegar DENTRO de un solo módulo, eso es un directorio, no una barra: pesaba
 * más que el contenido y repetía la estructura que ya da el menú izquierdo.
 *
 * Ahora es una sola fila en el orden en que se trabaja: mirar, cobrar, pagar,
 * cuadrar, documentar, cerrar. El orden ES la agrupación; no hacen falta
 * títulos para decir que «Por cobrar» y «Por pagar» van juntos, están juntos.
 * Los grupos siguen existiendo como dato porque el filtro por permisos se
 * apoya en ellos.
 */
export default function ContabilidadSidebar() {
  const pathname = usePathname() ?? "";
  const { user } = useUser();
  const items = filtrarGruposContabilidad(user).flatMap((g) => g.items);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Secciones de contabilidad"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 2,
        alignItems: "center",
        paddingBottom: 10,
        borderBottom: "1px solid var(--nx-panel-hairline, var(--border))",
        marginBottom: 4,
      }}
    >
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <CrossPanelLink
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="nx-contab-nav-link"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 28,
              padding: "0 10px",
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: active ? 600 : 400,
              lineHeight: 1,
              whiteSpace: "nowrap",
              textDecoration: "none",
              color: active ? "var(--primary)" : "var(--text-secondary)",
              background: active
                ? "color-mix(in srgb, var(--primary) 9%, transparent)"
                : "transparent",
            }}
          >
            {item.label}
          </CrossPanelLink>
        );
      })}

      <style>{`
        .nx-contab-nav-link:hover {
          background: color-mix(in srgb, var(--text-primary) 6%, transparent);
          color: var(--text-primary);
        }
        .nx-contab-nav-link[aria-current="page"]:hover {
          background: color-mix(in srgb, var(--primary) 14%, transparent);
          color: var(--primary);
        }
        /* Sin esto, tabular por la barra no dejaba ver dónde estaba el foco:
           el enlace activo se distingue por color y peso, pero el foco no. */
        .nx-contab-nav-link:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 1px;
          color: var(--text-primary);
        }
      `}</style>
    </nav>
  );
}
