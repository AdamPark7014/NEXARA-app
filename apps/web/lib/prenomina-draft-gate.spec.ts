import { describe, expect, it } from "vitest";
import {
  DRAFT_APPROVAL_PREFIX,
  appendDraftApprovalNote,
  buildDraftApprovalStamp,
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

  it("needs confirm only for Borrador", () => {
    expect(needsDraftApprovalConfirm("Borrador")).toBe(true);
    expect(needsDraftApprovalConfirm(" Pagado ")).toBe(false);
    expect(needsDraftApprovalConfirm("Anulado")).toBe(false);
    expect(needsDraftApprovalConfirm(null)).toBe(false);
  });
});
