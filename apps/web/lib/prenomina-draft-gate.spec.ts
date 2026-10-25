import { describe, expect, it } from "vitest";
import {
  DRAFT_APPROVAL_PREFIX,
  appendDraftApprovalNote,
  buildDraftApprovalStamp,
  draftGateConfirmCopy,
  needsDraftApprovalConfirm,
} from "./prenomina-draft-gate";

describe("prenomina-draft-gate", () => {
  const at = new Date("2026-09-20T15:30:00.000Z");

  it("builds stamp with prefix and actor", () => {
    const stamp = buildDraftApprovalStamp("Ada", at);
    expect(stamp.startsWith(DRAFT_APPROVAL_PREFIX)).toBe(true);
    expect(stamp).toContain("por Ada");
    expect(stamp).toContain("2026-09-20 15:30");
  });

  it("appends stamp to empty and existing notes", () => {
    expect(appendDraftApprovalNote(null, "Ada", at)).toBe(
      "[Aprobado borrador] por Ada · 2026-09-20 15:30",
    );
    expect(appendDraftApprovalNote("Extras 30m", "Ada", at)).toBe(
      "Extras 30m | [Aprobado borrador] por Ada · 2026-09-20 15:30",
    );
  });

  it("is idempotent when stamp already present", () => {
    const once = appendDraftApprovalNote("x", "Ada", at);
    expect(appendDraftApprovalNote(once, "Bob", at)).toBe(once);
  });

  it("deja el aviso en una frase y cita el texto viejo", () => {
    const textoViejo =
      "¿Aprobar borrador y marcar como pagado? Se registrará la aprobación en la nota del pago.";
    expect(textoViejo.split(/(?<=[?!.])\s+/)).toEqual([
      "¿Aprobar borrador y marcar como pagado?",
      "Se registrará la aprobación en la nota del pago.",
    ]);
    expect(draftGateConfirmCopy.CONFIRM_MESSAGE).toBe(
      "¿Aprobar borrador y marcar como pagado, registrando la aprobación en la nota del pago?",
    );
    expect(draftGateConfirmCopy.CONFIRM_MESSAGE).not.toBe(textoViejo);
    expect(draftGateConfirmCopy.CONFIRM_MESSAGE.split(/(?<=[?!.])\s+/)).toEqual([
      "¿Aprobar borrador y marcar como pagado, registrando la aprobación en la nota del pago?",
    ]);
    expect(draftGateConfirmCopy.CONFIRM_LABEL).toBe("Aprobar borrador");
    expect(DRAFT_APPROVAL_PREFIX).toBe("[Aprobado borrador]");
  });

  it("needs confirm only for Borrador", () => {
    expect(needsDraftApprovalConfirm("Borrador")).toBe(true);
    expect(needsDraftApprovalConfirm(" Pagado ")).toBe(false);
    expect(needsDraftApprovalConfirm("Anulado")).toBe(false);
    expect(needsDraftApprovalConfirm(null)).toBe(false);
  });
});
