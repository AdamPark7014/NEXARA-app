"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import CrossPanelLink from "@/components/CrossPanelLink";
import { useUser } from "@/components/UserContext";
import { EVENTO_RESUMEN, getResumen, type Resumen } from "@/lib/mesa-contable";
import { PERMISSIONS, hasAnyPermission, type UserPermissions } from "@/lib/permissions";
import c from "@/components/mesa-contable/chips.module.scss";

/**
 * Fila de chips de la Mesa contable (maqueta aprobada 29-10-2026), en lenguaje de tareas.
 *
 * Orden fijo: Hoy · Por facturar · Pagos y gastos · Estados financieros · Cuadrar banco ·
 * Me deben · Debo pagar · Cerrar el mes · Más. «Por facturar» y «Pagos y gastos» llevan el
 * contador de `GET /mesa/resumen`. Lo demás (facturas, entradas y salidas, pólizas,
 * proveedores, nómina, costos, presupuestos, informes, bitácora) vive en «Más».
 *
 * Cada chip se filtra por permiso (`hasAnyPermission`): el menú no ofrece puertas que la API
 * cierra con 403. Las rutas no cambian.
 *
 * Dónde se pinta: el layout de contabilidad la pone arriba de cada página. Las pantallas de
 * la Mesa (por facturar, pagos y gastos, estados) la ponen ellas mismas DEBAJO de su
 * encabezado, como en la maqueta, con `<ContabilidadSidebar enPagina />`; en esas rutas la
 * copia del layout no se pinta. La de preparar un CFDI no lleva chips (tampoco en la maqueta).
 */
type NavItem = {
  id: string;
  label: string;
  href: string;
  exact?: boolean;
  permissions: string[];
  /** Contador de `GET /mesa/resumen` que lleva el chip. */
  contador?: keyof Resumen;
};
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

export const GRUPOS_CONTABILIDAD: NavGroup[] = [
  {
    id: "dia",
    label: "Mesa contable",
    items: [
      { id: "home", label: "Hoy", href: "/erp/contabilidad", exact: true, permissions: VER_CONTABILIDAD },
      {
        id: "porFacturar",
        label: "Por facturar",
        href: "/erp/contabilidad/por-facturar",
        permissions: VER_FACTURACION,
        contador: "porFacturar",
      },
      {
        id: "pagosGastos",
        label: "Pagos y gastos",
        href: "/erp/contabilidad/pagos-y-gastos",
        permissions: VER_CONTABILIDAD,
        contador: "pagosPendientes",
      },
      { id: "estados", label: "Estados financieros", href: "/erp/contabilidad/estados", permissions: VER_CONTABILIDAD },
      { id: "conciliacion", label: "Cuadrar banco", href: "/erp/contabilidad/conciliacion", permissions: VER_BANCOS },
      { id: "cxc", label: "Me deben", href: "/erp/contabilidad/cuentas-por-cobrar", permissions: VER_FACTURACION },
      { id: "cxp", label: "Debo pagar", href: "/erp/contabilidad/cuentas-por-pagar", permissions: VER_FACTURACION },
      { id: "cierres", label: "Cerrar el mes", href: "/erp/contabilidad/cierres", permissions: CERRAR_PERIODO },
    ],
  },
  {
    id: "mas",
    label: "Más",
    items: [
      { id: "facturas", label: "Facturas", href: "/erp/contabilidad/facturas", permissions: VER_FACTURACION },
      { id: "movimientos", label: "Entradas y salidas", href: "/erp/contabilidad/movimientos", permissions: VER_CONTABILIDAD },
      { id: "polizas", label: "Cuentas y asientos", href: "/erp/contabilidad/polizas", permissions: VER_CONTABILIDAD },
      { id: "proveedores", label: "Proveedores", href: "/erp/contabilidad/proveedores", permissions: VER_FACTURACION },
      { id: "prenomina", label: "Pago al personal", href: "/erp/contabilidad/pre-nomina", permissions: VER_NOMINA },
      { id: "proyectos", label: "Costos por proyecto", href: "/erp/contabilidad/proyectos", permissions: VER_CONTABILIDAD },
      { id: "presupuestos", label: "Presupuestos", href: "/erp/contabilidad/presupuestos", permissions: VER_CONTABILIDAD },
      { id: "reportes", label: "Informes", href: "/erp/contabilidad/reportes", permissions: VER_CONTABILIDAD },
      { id: "auditoria", label: "Quién cambió qué", href: "/erp/contabilidad/auditoria", permissions: VER_AUDITORIA },
    ],
  },
];

/** Rutas que pintan los chips ellas mismas, bajo su encabezado (o sin chips, como el CFDI). */
const RUTAS_CON_CHIPS_PROPIOS = [
  "/erp/contabilidad/por-facturar",
  "/erp/contabilidad/pagos-y-gastos",
  "/erp/contabilidad/estados",
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

function esRutaConChipsPropios(pathname: string) {
  return RUTAS_CON_CHIPS_PROPIOS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/** Contadores de los chips; se refrescan al navegar y cuando una pantalla avisa que cambió algo. */
function useResumenMesa(activo: boolean, pathname: string): Resumen | null {
  const { user, isContextReady } = useUser();
  const token = user?.token ?? "";
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const turno = useRef(0);

  const cargar = useCallback(async () => {
    if (!activo || !token) return;
    const mio = ++turno.current;
    try {
      const r = await getResumen(token);
      if (mio === turno.current) setResumen(r);
    } catch {
      // Un contador que no llega no estorba la navegación: los chips siguen sin número.
      if (mio === turno.current) setResumen(null);
    }
  }, [activo, token]);

  useEffect(() => {
    if (!isContextReady) return;
    void cargar();
  }, [isContextReady, cargar, pathname]);

  useEffect(() => {
    const alCambiar = () => void cargar();
    window.addEventListener(EVENTO_RESUMEN, alCambiar);
    return () => window.removeEventListener(EVENTO_RESUMEN, alCambiar);
  }, [cargar]);

  return resumen;
}

function Chip({ item, pathname, resumen }: { item: NavItem; pathname: string; resumen: Resumen | null }) {
  const active = isActive(pathname, item);
  const n = item.contador && resumen ? resumen[item.contador] : null;
  return (
    <CrossPanelLink href={item.href} aria-current={active ? "page" : undefined} className={c.chip}>
      {item.label}
      {typeof n === "number" && n > 0 ? (
        <span className={c.count}>
          {n}
          <span className="ui-sr-only"> pendientes</span>
        </span>
      ) : null}
    </CrossPanelLink>
  );
}

function Mas({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const idMenu = useId();
  const activo = items.find((i) => isActive(pathname, i));

  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  return (
    <div
      className={c.more}
      ref={caja}
      onKeyDown={(e) => {
        if (e.key === "Escape" && abierto) {
          e.preventDefault();
          setAbierto(false);
          boton.current?.focus();
        }
      }}
    >
      <button
        ref={boton}
        type="button"
        className={c.chip}
        data-activo={activo ? "true" : undefined}
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        onClick={() => setAbierto((v) => !v)}
      >
        Más
        {activo ? <span className="ui-sr-only">: estás en {activo.label}</span> : null}
      </button>
      {abierto ? (
        <div id={idMenu} className={c.menu}>
          {items.map((item) => (
            <CrossPanelLink
              key={item.id}
              href={item.href}
              className={c.item}
              aria-current={isActive(pathname, item) ? "page" : undefined}
            >
              {item.label}
            </CrossPanelLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChipsMesa({ pathname }: { pathname: string }) {
  const { user } = useUser();
  const grupos = filtrarGruposContabilidad(user);
  const primarios = grupos.find((g) => g.id === "dia")?.items ?? [];
  const mas = grupos.find((g) => g.id === "mas")?.items ?? [];
  const conContador = primarios.some((i) => i.contador);
  const resumen = useResumenMesa(conContador, pathname);

  if (primarios.length === 0 && mas.length === 0) return null;

  return (
    <nav aria-label="Mesa contable" className={c.nav}>
      {primarios.map((item) => (
        <Chip key={item.id} item={item} pathname={pathname} resumen={resumen} />
      ))}
      {mas.length > 0 ? <Mas items={mas} pathname={pathname} /> : null}
    </nav>
  );
}

export default function ContabilidadSidebar({ enPagina = false }: { enPagina?: boolean }) {
  const pathname = usePathname() ?? "";
  // En las pantallas de la Mesa los chips van bajo el encabezado: la copia del layout se calla.
  if (!enPagina && esRutaConChipsPropios(pathname)) return null;
  return <ChipsMesa pathname={pathname} />;
}
