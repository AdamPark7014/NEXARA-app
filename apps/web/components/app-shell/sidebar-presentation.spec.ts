import { describe, expect, it } from "vitest";
import { MODULES } from "@/lib/access-matrix";
import { CORE_OLA1_MODULE_IDS } from "@/lib/core-surface";
import { ORG_EMAILS } from "@/lib/activity-kinds";
import { buildUserSidebar } from "@/lib/user-access";
import { CORE_GROUP_ORDER, DEFAULT_FOLDED_GROUP_IDS, formatNavCount, grupoCore, presentSidebarGroups } from "./sidebar-presentation";

const g = (title: string, ids: string[]) => ({ title, items: ids.map((id) => ({ id })) });

describe("presentSidebarGroups", () => {
  it("ordena Core por lo que hace la empresa y deja Empresa al final", () => {
    const out = presentSidebarGroups(
      [g("Mi cuenta", ["my-profile"]), g("Finanzas", ["erp-contabilidad"]), g("Equipo y recursos", ["erp-almacen"]), g("Hoy", ["pizarra"]), g("Clientes y obra", ["erp-clients"])],
      "erp",
    );
    expect(out.map((x) => x.title)).toEqual(["Hoy", "Vender", "Hacer", "Cobrar y pagar", "Empresa"]);
  });

  it("acomoda «Hoy»: actividades antes que chat", () => {
    const [hoy] = presentSidebarGroups([g("Hoy", ["executive", "chat", "mis-actividades", "pizarra"])], "erp");
    expect(hoy!.items.map((i) => i.id)).toEqual(["executive", "mis-actividades", "pizarra", "chat"]);
  });

  it("un grupo desconocido queda antes de «Empresa» y no se pierde ningún módulo", () => {
    const out = presentSidebarGroups([g("Mi cuenta", ["my-profile"]), g("Otro", ["x"]), g("Hoy", ["pizarra"])], "erp");
    expect(out.map((x) => x.title)).toEqual(["Hoy", "Otro", "Empresa"]);
    expect(out.flatMap((x) => x.items.map((i) => i.id)).sort()).toEqual(["my-profile", "pizarra", "x"]);
  });

  it("fuera de Core no toca el orden", () => {
    const input = [g("Pipeline", ["crm-dashboard"]), g("Mi cuenta", ["my-profile"])];
    expect(presentSidebarGroups(input, "crm")).toBe(input);
  });

  it("todo módulo de Core cae en un grupo del nuevo agrupado", () => {
    for (const id of CORE_OLA1_MODULE_IDS) {
      const m = MODULES[id as keyof typeof MODULES];
      expect(CORE_GROUP_ORDER, id).toContain(grupoCore(id, m.group));
    }
  });

  it("el grupo plegado por omisión es el que existe", () => {
    const empresa = presentSidebarGroups([g("Mi cuenta", ["my-profile"])], "erp")[0] as unknown as { id: string };
    expect(DEFAULT_FOLDED_GROUP_IDS).toContain(empresa.id);
  });
});

/** Cada persona, con el permiso real de su rol: es lo que se aprobó en la muestra del Bloque B. */
describe("el menú de cada persona", () => {
  const menu = (roleKey: string, email = "persona@nexara.com.mx") =>
    Object.fromEntries(
      presentSidebarGroups(buildUserSidebar("erp", { id: 1, nombre: "x", email, roleKey, role: roleKey, orgRoleKey: roleKey } as never), "erp", roleKey).map(
        (grupo) => [grupo.title, grupo.items.map((i) => i.label)],
      ),
    );

  it("técnicos: Reuniones y Organigrama pasan a Empresa, sin quitarles nada", () => {
    expect(menu("ing_campo")).toEqual({
      Hoy: ["Actividades", "Asistencias", "Chat"],
      Hacer: ["Herramientas", "Vehículos"],
      Empresa: ["Reuniones", "Organigrama", "Mi perfil"],
    });
  });

  it("soporte además ve Desempeño", () => {
    expect(menu("ing_soporte").Saber).toEqual(["Desempeño"]);
  });

  it("administración: Facturación sigue a la vista, porque no tiene Mesa contable", () => {
    expect(menu("administrativo", ORG_EMAILS.daniela)).toEqual({
      Hoy: ["Actividades", "Asistencias", "Chat", "Reuniones", "Aprobaciones jerárquicas"],
      Vender: ["Clientes", "Cotizaciones", "Diseños de cámaras"],
      Hacer: ["Proyectos", "Almacén"],
      "Cobrar y pagar": ["Facturación", "Viáticos", "Gastos"],
      Saber: ["Costos"],
      Empresa: ["Organigrama", "Mi perfil"],
    });
  });

  it("encargados", () => {
    expect(menu("coord_operaciones", ORG_EMAILS.david)).toEqual({
      Hoy: ["Actividades", "Asistencias", "Chat", "Reuniones", "Aprobaciones jerárquicas"],
      Vender: ["Clientes", "Cotizaciones", "Diseños de cámaras"],
      Hacer: ["Proyectos", "Almacén", "Herramientas", "Vehículos"],
      Saber: ["Costos", "Desempeño"],
      Empresa: ["Organigrama", "Mi perfil"],
    });
  });

  it("Clientes sigue siendo de quien lleva actividades comerciales, no de todo el rol", () => {
    expect(menu("administrativo").Vender).toEqual(["Cotizaciones", "Diseños de cámaras"]);
  });

  it("dirección: Facturación y Bancos se abren desde Mesa contable", () => {
    expect(menu("ceo")).toEqual({
      Hoy: ["Hoy", "Actividades", "Asistencias", "Chat", "Reuniones", "Aprobaciones jerárquicas"],
      Vender: ["Clientes", "Cotizaciones", "Diseños de cámaras"],
      Hacer: ["Proyectos", "Almacén", "Herramientas", "Vehículos"],
      "Cobrar y pagar": ["Mesa contable", "Viáticos", "Gastos", "Nómina"],
      Personas: ["Plantilla RRHH", "Multas e incidencias"],
      Saber: ["Costos", "Desempeño"],
      Empresa: ["Organigrama", "Mi perfil"],
      Gobierno: ["Usuarios y roles"],
    });
  });
});

describe("formatNavCount", () => {
  it("oculta el cero y recorta arriba de 99", () => {
    expect(formatNavCount(0)).toBeNull();
    expect(formatNavCount(undefined)).toBeNull();
    expect(formatNavCount(7)).toBe("7");
    expect(formatNavCount(140)).toBe("99+");
  });
});
