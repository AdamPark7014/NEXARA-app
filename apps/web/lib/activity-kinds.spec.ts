import { describe, expect, it } from "vitest";
import { ORG_EMAILS, kindsForAssignment, kindsForCreator, kindsForTarget } from "@/lib/activity-kinds";
import { clientSectorsForActivityKind } from "@/lib/client-sectors";

const PAULINA = "finanzas@nexara.com.mx";

describe("tipos de actividad por persona (creador × destinatario)", () => {
  it("Paulina (contadora) crea y recibe tarea y comercial, como Daniela y Mónica", () => {
    expect(ORG_EMAILS.paulina).toBe(PAULINA);
    expect(kindsForCreator({ v2Role: null, email: PAULINA })).toEqual(["tarea", "comercial"]);
    expect(kindsForTarget(PAULINA)).toEqual(["tarea", "comercial"]);
    expect(kindsForCreator({ v2Role: null, email: PAULINA })).toEqual(
      kindsForCreator({ v2Role: null, email: ORG_EMAILS.daniela }),
    );
    expect(kindsForTarget(PAULINA)).toEqual(kindsForTarget(ORG_EMAILS.monica));
  });

  it("en «Auto-asignarme» Paulina ve Tarea y Comercial (antes solo Tarea)", () => {
    expect(kindsForAssignment({ creatorEmail: PAULINA, targetEmail: PAULINA, v2Role: null })).toEqual([
      "tarea",
      "comercial",
    ]);
    // El correo llega como lo escribió quien la dio de alta.
    expect(kindsForAssignment({ creatorEmail: " Finanzas@Nexara.com.mx ", targetEmail: PAULINA })).toEqual([
      "tarea",
      "comercial",
    ]);
  });

  it("Christian le puede asignar una comercial; David también; un servicio no le llega a ella", () => {
    expect(kindsForAssignment({ creatorEmail: ORG_EMAILS.ceo, targetEmail: PAULINA })).toEqual(["tarea", "comercial"]);
    expect(kindsForAssignment({ creatorEmail: ORG_EMAILS.david, targetEmail: PAULINA })).toEqual([
      "tarea",
      "comercial",
    ]);
    expect(kindsForAssignment({ creatorEmail: ORG_EMAILS.luis, targetEmail: PAULINA })).not.toContain("servicio");
  });

  it("quien no está en los mapas sigue cayendo en «solo tarea»", () => {
    expect(kindsForCreator({ v2Role: null, email: "nuevo@nexara.com.mx" })).toEqual(["tarea"]);
    expect(kindsForTarget("nuevo@nexara.com.mx")).toEqual(["tarea"]);
    expect(kindsForAssignment({ creatorEmail: "nuevo@nexara.com.mx", targetEmail: "nuevo@nexara.com.mx" })).toEqual([
      "tarea",
    ]);
  });

  it("los demás no cambian", () => {
    expect(kindsForAssignment({ creatorEmail: ORG_EMAILS.daniela, targetEmail: ORG_EMAILS.daniela })).toEqual([
      "tarea",
      "comercial",
    ]);
    expect(kindsForAssignment({ creatorEmail: ORG_EMAILS.roberto, targetEmail: ORG_EMAILS.roberto })).toEqual(["tarea"]);
    expect(kindsForAssignment({ creatorEmail: ORG_EMAILS.joan, targetEmail: ORG_EMAILS.joan })).toEqual(["tarea"]);
  });
});

describe("clientes que se ofrecen al crear una actividad comercial", () => {
  it("Paulina no está en la matriz de Clientes: en comercial usa el padrón comercial", () => {
    expect(clientSectorsForActivityKind("comercial", PAULINA)).toEqual(["COMERCIAL"]);
  });

  it("quien sí está en la matriz conserva sus sectores", () => {
    expect(clientSectorsForActivityKind("comercial", ORG_EMAILS.david)).toEqual(["PROYECTO", "COMERCIAL"]);
    expect(clientSectorsForActivityKind("comercial", ORG_EMAILS.daniela)).toEqual(["COMERCIAL"]);
  });

  it("el respaldo es solo para comercial: los demás tipos no abren padrones", () => {
    expect(clientSectorsForActivityKind("servicio", PAULINA)).toEqual([]);
    expect(clientSectorsForActivityKind("obra", PAULINA)).toEqual([]);
    expect(clientSectorsForActivityKind("tarea", PAULINA)).toEqual([]);
    expect(clientSectorsForActivityKind("obra", ORG_EMAILS.daniela)).toEqual([]);
  });
});
