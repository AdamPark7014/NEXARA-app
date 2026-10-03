import { describe, expect, it } from "vitest";
import { ORG_EMAILS } from "@/lib/activity-kinds";
import {
  ALL_CLIENT_SECTORS,
  canAccessClientPadron,
  clientSectorsForUser,
  puedeVerModuloClientes,
  tieneActividadesComerciales,
} from "@/lib/client-sectors";

describe("sectores de clientes por persona y por rol", () => {
  it("el correo del encargado gana sobre el rol", () => {
    expect(clientSectorsForUser({ email: ORG_EMAILS.luis, roleKey: "coord_operaciones" })).toEqual(["CORPORATIVO"]);
    expect(clientSectorsForUser({ email: ORG_EMAILS.daniela, roleKey: "administrativo" })).toEqual(["COMERCIAL"]);
    expect(clientSectorsForUser({ email: ORG_EMAILS.david, roleKey: "coord_operaciones" })).toEqual([
      "PROYECTO",
      "COMERCIAL",
    ]);
  });

  it("un coordinador que no está en la matriz usa los sectores de su rol", () => {
    expect(clientSectorsForUser({ email: "nuevo.coord@nexara.com.mx", roleKey: "coord_operaciones" })).toEqual(
      ALL_CLIENT_SECTORS,
    );
    expect(canAccessClientPadron({ email: "nueva.comercial@nexara.com.mx", roleKey: "administrativo" })).toBe(true);
    expect(clientSectorsForUser({ email: "nueva.comercial@nexara.com.mx", roleKey: "administrativo" })).toEqual([
      "COMERCIAL",
    ]);
  });

  it("un ingeniero u operativo no ve el padrón", () => {
    expect(canAccessClientPadron({ email: ORG_EMAILS.israel, roleKey: "ing_campo" })).toBe(false);
    expect(canAccessClientPadron({ email: "carolina@nexara.com.mx", roleKey: "ing_soporte" })).toBe(false);
    expect(canAccessClientPadron({ email: "vendedor@nexara.com.mx", roleKey: "vendedor" })).toBe(false);
  });
});

describe("Clientes en el menú: quien lleva actividades comerciales", () => {
  it("sale de quién crea o recibe actividades comerciales, no de una lista aparte", () => {
    for (const email of [
      ORG_EMAILS.ceo,
      ORG_EMAILS.developer,
      ORG_EMAILS.david,
      ORG_EMAILS.luis,
      ORG_EMAILS.antonio,
      ORG_EMAILS.daniela,
      ORG_EMAILS.monica,
      ORG_EMAILS.josue,
      "finanzas@nexara.com.mx",
    ]) {
      expect(tieneActividadesComerciales({ email }), email).toBe(true);
      expect(puedeVerModuloClientes({ email }), email).toBe(true);
    }
  });

  it("campo y soporte no llevan comercial: sin Clientes en el menú", () => {
    for (const email of [ORG_EMAILS.joan, ORG_EMAILS.israel, ORG_EMAILS.carolina, ORG_EMAILS.roberto]) {
      expect(puedeVerModuloClientes({ email, roleKey: "ing_campo" }), email).toBe(false);
    }
    expect(puedeVerModuloClientes({ email: "nuevo@nexara.com.mx", roleKey: "administrativo" })).toBe(false);
    expect(puedeVerModuloClientes(null)).toBe(false);
  });

  it("dirección lo ve por su rol aunque el correo no esté en los mapas", () => {
    expect(puedeVerModuloClientes({ roleKey: "ceo" })).toBe(true);
    expect(puedeVerModuloClientes({ roleKey: "super_admin", isSuperAdmin: true })).toBe(true);
  });

  it("quien lo ve en el menú siempre tiene al menos un sector que abrir", () => {
    // Paulina entra por su rol (administrativo → comercial).
    expect(clientSectorsForUser({ email: "finanzas@nexara.com.mx", roleKey: "administrativo" })).toEqual(["COMERCIAL"]);
    // Y si su rol no trajera padrón, lleva comercial: ve a los clientes comerciales.
    expect(clientSectorsForUser({ email: "finanzas@nexara.com.mx", roleKey: "lider_diseno" })).toEqual(["COMERCIAL"]);
    expect(canAccessClientPadron({ email: "finanzas@nexara.com.mx", roleKey: "lider_diseno" })).toBe(true);
  });
});
