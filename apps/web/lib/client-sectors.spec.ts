import { describe, expect, it } from "vitest";
import { ORG_EMAILS } from "@/lib/activity-kinds";
import { ALL_CLIENT_SECTORS, canAccessClientPadron, clientSectorsForUser } from "@/lib/client-sectors";

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
