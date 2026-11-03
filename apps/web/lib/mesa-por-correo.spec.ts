import { describe, expect, it } from "vitest";
import { presentSidebarGroups } from "@/components/app-shell/sidebar-presentation";
import { filtrarGruposContabilidad } from "@/components/erp/ContabilidadSidebar";
import { canUsarMesaContable, esRutaDeMesaPorCorreo } from "@/lib/mesa-por-correo";
import { PERMISSIONS } from "@/lib/permissions";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import { buildUserSidebar, canUserAccessPath } from "@/lib/user-access";

const contadora = {
  email: "finanzas@nexara.com.mx",
  roleKey: "administrativo",
  // Su sesión abierta puede traer los permisos de antes de la concesión.
  permissions: [PERMISSIONS.CONTABILIDAD_VIEW],
};
const otraPersona = { ...contadora, email: "oficina@nexara.com.mx" };

const idsDelMenu = (user: typeof contadora) =>
  presentSidebarGroups(buildUserSidebar("erp", user), "erp", "administrativo").flatMap((g) =>
    g.items.map((i) => i.id as string),
  );
const riel = (user: typeof contadora) =>
  filtrarGruposContabilidad(user).flatMap((g) => g.items.map((i) => i.id));

describe("Mesa contable por persona", () => {
  it("es la cuenta de la Contadora General y nadie más", () => {
    expect(canUsarMesaContable(" Finanzas@Nexara.com.mx ")).toBe(true);
    expect(canUsarMesaContable(otraPersona.email)).toBe(false);
    expect(canUsarMesaContable(null)).toBe(false);
  });

  it("reconoce sus rutas sin confundirse con otras parecidas", () => {
    expect(esRutaDeMesaPorCorreo("/erp/contabilidad/?x=1")).toBe(true);
    expect(esRutaDeMesaPorCorreo("/erp/contabilidad/pagos-y-gastos")).toBe(true);
    expect(esRutaDeMesaPorCorreo("/erp/contabilidad/pre-nomina")).toBe(false);
    expect(esRutaDeMesaPorCorreo("/erp/contabilidad-otra")).toBe(false);
  });

  it("le abre la Mesa y los bancos", () => {
    for (const ruta of ["/erp/contabilidad", "/erp/contabilidad/conciliacion", "/erp/banking"]) {
      expect(canUserAccessPath(contadora, ruta)).toBe(true);
    }
  });

  it("no le abre Nómina por ninguna de sus dos páginas", () => {
    expect(canUserAccessPath(contadora, "/erp/contabilidad/pre-nomina")).toBe(false);
    expect(canUserAccessPath(contadora, "/erp/finance/employee-payments")).toBe(false);
  });

  it("no le quita lo que ya usa", () => {
    for (const ruta of ["/erp/asistencias", "/erp/cotizaciones", "/erp/clientes", "/erp/costos"]) {
      expect(canUserAccessPath(contadora, ruta)).toBe(true);
    }
  });

  it("no le abre nada a otra persona del mismo rol", () => {
    expect(canUserAccessPath(otraPersona, "/erp/contabilidad")).toBe(false);
    expect(canUserAccessPath(otraPersona, "/erp/banking")).toBe(false);
    expect(riel(otraPersona)).not.toContain("bancos");
  });

  it("su menú trae Mesa contable, y Facturación y Bancos pasan adentro", () => {
    const menu = idsDelMenu(contadora);
    const antes = idsDelMenu(otraPersona);
    expect(menu).toContain("erp-contabilidad");
    expect(menu).not.toContain("banking");
    expect(menu).not.toContain("invoicing");
    expect(menu).not.toContain("employee-payments");
    // Frente a su rol sin la concesión, lo único que sale del menú es Facturación, que pasa adentro.
    expect(antes.filter((id) => !menu.includes(id))).toEqual(["invoicing"]);
  });

  it("el riel de la Mesa le da los bancos y no el pago al personal", () => {
    const ids = riel(contadora);
    for (const id of ["home", "pagosGastos", "conciliacion", "cierres", "bancos", "facturas"]) {
      expect(ids).toContain(id);
    }
    expect(ids).not.toContain("prenomina");
    expect(ids).not.toContain("auditoria");
  });

  it("en Bancos puede trabajar como contabilidad; en Nómina, no", () => {
    expect(getErpFinanceSectionConfig(contadora, "banking")).toMatchObject({ viewMode: "manage", canCreate: true });
    expect(getErpFinanceSectionConfig(contadora, "employee-payments")).toMatchObject({
      viewMode: "execute",
      canCreate: false,
    });
    expect(getErpFinanceSectionConfig(otraPersona, "banking")).toMatchObject({ viewMode: "execute", canCreate: false });
  });
});
