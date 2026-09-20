import React, { useState } from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConfirmDialog, { type ConfirmState } from "./ConfirmDialog";

/**
 * Marcar pagado (y el resto de confirms) pasa por aquí. `busy` deshabilita el
 * botón tras el repintado, pero un doble clic síncrono entra dos veces antes —
 * el cerrojo es un ref. Estas pruebas fijan ese contrato.
 */

function Harness({ initial }: { initial: ConfirmState }) {
  const [state, setState] = useState<ConfirmState | null>(initial);
  return <ConfirmDialog state={state} onClose={() => setState(null)} />;
}

describe("ConfirmDialog · cerrojo in-flight", () => {
  it("muestra Procesando… y deshabilita mientras fn vuela", async () => {
    let resolve!: () => void;
    const fn = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          message: "¿Marcar como pagado?",
          confirmLabel: "Marcar pagado",
          danger: false,
          fn,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Marcar pagado" }));
    const busyBtn = await screen.findByRole("button", { name: "Procesando…" });
    expect(busyBtn).toBeDisabled();
    expect(fn).toHaveBeenCalledTimes(1);

    resolve();
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("doble clic síncrono en Confirmar solo corre fn una vez", async () => {
    let resolve!: () => void;
    const fn = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    render(
      <Harness
        initial={{
          message: "¿Seguro?",
          confirmLabel: "Confirmar",
          danger: false,
          fn,
        }}
      />,
    );

    const btn = screen.getByRole("button", { name: "Confirmar" });
    // Dos clics antes del repintado: sin busyRef esto llamaría fn dos veces.
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(fn).toHaveBeenCalledTimes(1);

    resolve();
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });
});
