import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field, Input } from "./campos";

describe("Field", () => {
  it("no vuelve a montar el campo cuando aparece o se va un error (no se pierde el foco)", () => {
    const { rerender } = render(
      <Field label="RFC">
        <Input defaultValue="" />
      </Field>,
    );
    const antes = screen.getByRole("textbox");
    antes.focus();
    expect(document.activeElement).toBe(antes);

    rerender(
      <Field label="RFC" error="RFC inválido">
        <Input defaultValue="" />
      </Field>,
    );
    const conError = screen.getByRole("textbox");
    expect(conError).toBe(antes);
    expect(document.activeElement).toBe(antes);
    expect(conError.getAttribute("aria-invalid")).toBe("true");

    rerender(
      <Field label="RFC" hint="13 caracteres">
        <Input defaultValue="" />
      </Field>,
    );
    expect(screen.getByRole("textbox")).toBe(antes);
    expect(document.activeElement).toBe(antes);
  });
});
