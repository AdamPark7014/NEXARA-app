import { describe, expect, it } from "vitest";
import {
  ORG_EMAILS,
  TAREA_OTRO_CHIP,
  esOtroLibre,
  kindsForAssignment,
  kindsForCreator,
  kindsForTarget,
  nombreOtroLibre,
  subtipoExistentePorNombre,
  subtipoTareaVista,
  ticketTypeCustomDeOtro,
  validarNombreOtro,
} from "@/lib/activity-kinds";
import { clientSectorsForActivityKind } from "@/lib/client-sectors";
import { kindLabel } from "@/lib/activity-labels";

const PAULINA = "finanzas@nexara.com.mx";

describe("tipos de actividad por persona (creador × destinatario)", () => {
  it("Paulina (contadora) crea y recibe tarea, comercial y administrativa, como Daniela y Mónica", () => {
    expect(ORG_EMAILS.paulina).toBe(PAULINA);
    expect(kindsForCreator({ v2Role: null, email: PAULINA })).toEqual(["tarea", "comercial", "administrativa"]);
    expect(kindsForTarget(PAULINA)).toEqual(["tarea", "comercial", "administrativa"]);
    expect(kindsForCreator({ v2Role: null, email: PAULINA })).toEqual(
      kindsForCreator({ v2Role: null, email: ORG_EMAILS.daniela }),
    );
    expect(kindsForTarget(PAULINA)).toEqual(kindsForTarget(ORG_EMAILS.monica));
  });

  it("en «Auto-asignarme» Paulina ve Tarea, Comercial y Administrativa", () => {
    expect(kindsForAssignment({ creatorEmail: PAULINA, targetEmail: PAULINA, v2Role: null })).toEqual([
      "tarea",
      "comercial",
      "administrativa",
    ]);
    // El correo llega como lo escribió quien la dio de alta.
    expect(kindsForAssignment({ creatorEmail: " Finanzas@Nexara.com.mx ", targetEmail: PAULINA })).toEqual([
      "tarea",
      "comercial",
      "administrativa",
    ]);
  });

  it("Christian le puede asignar una comercial; David también; un servicio no le llega a ella", () => {
    expect(kindsForAssignment({ creatorEmail: ORG_EMAILS.ceo, targetEmail: PAULINA })).toEqual(["tarea", "comercial", "administrativa"]);
    expect(kindsForAssignment({ creatorEmail: ORG_EMAILS.david, targetEmail: PAULINA })).toEqual([
      "tarea",
      "comercial",
      "administrativa",
    ]);
    expect(kindsForAssignment({ creatorEmail: ORG_EMAILS.luis, targetEmail: PAULINA })).not.toContain("servicio");
  });

  it("quien no está en los mapas: crea solo tarea; recibe tarea y administrativa", () => {
    expect(kindsForCreator({ v2Role: null, email: "nuevo@nexara.com.mx" })).toEqual(["tarea"]);
    expect(kindsForTarget("nuevo@nexara.com.mx")).toEqual(["tarea", "administrativa"]);
    expect(kindsForAssignment({ creatorEmail: "nuevo@nexara.com.mx", targetEmail: "nuevo@nexara.com.mx" })).toEqual([
      "tarea",
    ]);
    expect(kindsForAssignment({ creatorEmail: ORG_EMAILS.ceo, targetEmail: "nuevo@nexara.com.mx" })).toEqual([
      "tarea",
      "administrativa",
    ]);
  });

  it("los demás no cambian", () => {
    expect(kindsForAssignment({ creatorEmail: ORG_EMAILS.daniela, targetEmail: ORG_EMAILS.daniela })).toEqual([
      "tarea",
      "comercial",
      "administrativa",
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

describe("Otro… con nombre libre", () => {
  it("guarda con prefijo Otro: y valida longitud 3–60", () => {
    expect(TAREA_OTRO_CHIP).toBe("Otro…");
    expect(ticketTypeCustomDeOtro("Pintar rack")).toBe("Otro: Pintar rack");
    expect(esOtroLibre("Otro: Pintar rack")).toBe(true);
    expect(nombreOtroLibre("Otro: Pintar rack")).toBe("Pintar rack");
    expect(validarNombreOtro("ab")).toMatch(/3/);
    expect(validarNombreOtro("x".repeat(61))).toMatch(/60/);
    expect(validarNombreOtro("Pintar rack")).toBeNull();
  });

  it("avisa si el nombre ya es un subtipo del catálogo", () => {
    expect(subtipoExistentePorNombre("instalacion")?.label).toBe("Instalación");
    expect(subtipoExistentePorNombre("Pintar rack")).toBeNull();
  });

  it("la ficha muestra el nombre y quita el prefijo Otro:", () => {
    expect(subtipoTareaVista("Otro: Pintar rack")).toEqual({ label: "Pintar rack", badgeOtro: true });
    expect(kindLabel({ coreKind: "tarea", ticketTypeCustom: "Otro: Pintar rack" })).toBe("Tarea · Pintar rack");
    expect(kindLabel({ coreKind: "tarea", ticketTypeCustom: "Junta" })).toBe("Tarea · Junta");
  });
});
