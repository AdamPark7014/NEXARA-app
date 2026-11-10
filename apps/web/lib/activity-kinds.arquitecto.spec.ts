import { describe, expect, it } from "vitest";
import { kindsForAssignment } from "./activity-kinds";
import { ROLES } from "./rbac/roles";

describe("arquitecto (10-11)", () => {
  it("cualquier arquitecto deja obra a un instalador de David y a sistemas de José Antonio", () => {
    const jorge = { creatorEmail: "jorge.placido@nexara.com.mx", v2Role: ROLES.ARQUITECTO };
    expect(kindsForAssignment({ ...jorge, targetEmail: "salvador.hernandez@nexara.com.mx" })).toContain("obra");
    expect(kindsForAssignment({ ...jorge, targetEmail: "soporte@nexara.com.mx" })).toContain("obra");
  });

  it("sin ser arquitecto, sistemas sigue sin recibir obra", () => {
    expect(kindsForAssignment({ creatorEmail: "gerencia@nexara.com.mx", targetEmail: "soporte@nexara.com.mx" })).not.toContain("obra");
  });
});
