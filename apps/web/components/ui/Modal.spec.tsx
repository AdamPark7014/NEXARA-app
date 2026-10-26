import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Modal from "./Modal";

describe("Modal · cambios sin guardar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("el confirm al cerrar con cambios cabe en una frase", async () => {
    const aviso = "Hay cambios sin guardar, ¿cerrar de todos modos?";

    const confirm = vi.fn((_mensaje?: string) => false);
    vi.stubGlobal("confirm", confirm);
    const onClose = vi.fn();
    const { unmount } = render(
      <Modal open dirty title="Editar nota" onClose={onClose}>
        <label>
          Nota
          <textarea defaultValue="borrador" />
        </label>
      </Modal>,
    );

    expect(screen.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(aviso);
    expect(onClose).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    confirm.mockReset();
    confirm.mockReturnValue(false);
    onClose.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(confirm).toHaveBeenCalledWith(aviso);
    expect(onClose).not.toHaveBeenCalled();

    confirm.mockClear();
    fireEvent.click(document.querySelector('[role="presentation"]')!);
    expect(confirm).toHaveBeenCalledWith(aviso);
    expect(onClose).not.toHaveBeenCalled();

    unmount();

    confirm.mockClear();
    onClose.mockClear();
    const limpio = render(
      <Modal open title="Editar nota" onClose={onClose}>
        <p>Sin cambios</p>
      </Modal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    fireEvent.click(document.querySelector('[role="presentation"]')!);
    await userEvent.keyboard("{Escape}");
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(3);
    limpio.unmount();

    const onDirtyClose = vi.fn(() => false);
    onClose.mockClear();
    render(
      <Modal open dirty title="Editar nota" onClose={onClose} onDirtyClose={onDirtyClose}>
        <p>Sucio</p>
      </Modal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onDirtyClose).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
