import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DoorConfirmModal } from "./_DoorConfirmModal";

/**
 * El diálogo más consecuente del producto: al aceptar se mueve una cerradura
 * física. Estas pruebas fijan las tres cosas que un modal así no puede no
 * tener — Esc, trampa de foco y devolución del foco — y la cuarta que aquí es
 * de seguridad: que se lea QUÉ puerta y DE QUÉ SITIO se va a accionar.
 *
 * Antes era un `div` con `position: fixed` en línea: se cerraba solo con el
 * ratón, el tabulador se escapaba a la página de detrás y al cerrar el foco
 * caía en el `<body>`.
 */

const BASE = {
  open: true,
  doorName: "Torniquete Recepción",
  doorId: "DOOR-17",
  doorLocation: "Planta baja · Vestíbulo",
  doorStateLabel: "Cerrada",
  siteName: "Planta Norte",
  controlType: "2" as const,
  onCancel: () => {},
  onConfirm: () => {},
};

describe("DoorConfirmModal · qué puerta se abre", () => {
  it("nombra la puerta, su ubicación, el sitio y el id antes que los controles", () => {
    render(<DoorConfirmModal {...BASE} />);

    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(dialogo).toHaveTextContent("Torniquete Recepción");
    expect(dialogo).toHaveTextContent("Planta baja · Vestíbulo");
    expect(dialogo).toHaveTextContent("Planta Norte");
    expect(dialogo).toHaveTextContent("DOOR-17");
    // El estado en vivo solo se pinta si llega: no se inventa un «Cerrada».
    expect(dialogo).toHaveTextContent("Ahora: Cerrada");
  });

  it("sin estado en vivo no finge uno", () => {
    render(<DoorConfirmModal {...BASE} doorStateLabel={null} />);
    expect(screen.getByRole("dialog")).not.toHaveTextContent("Ahora:");
  });

  it("avisa de que la acción franquea el paso cuando así es", () => {
    render(<DoorConfirmModal {...BASE} allowTypeSelect controlType="0" />);
    expect(screen.getByRole("dialog")).toHaveTextContent("franquea el paso físico");
  });

  it("cerrar no se marca como acción de riesgo", () => {
    render(<DoorConfirmModal {...BASE} allowTypeSelect controlType="1" />);
    expect(screen.getByRole("dialog")).not.toHaveTextContent("franquea el paso físico");
  });
});

describe("DoorConfirmModal · motivo obligatorio", () => {
  it("no deja confirmar sin motivo y manda el motivo recortado", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DoorConfirmModal {...BASE} onConfirm={onConfirm} />);

    const confirmar = screen.getByRole("button", { name: /Confirmar · Abrir/ });
    const motivo = screen.getByLabelText(/Motivo/);
    expect(confirmar).toBeDisabled();

    // Dos caracteres no bastan: el mínimo son 3 ya recortados, así que unos
    // espacios tampoco cuelan como motivo de auditoría.
    await user.type(motivo, "  ok  ");
    expect(confirmar).toBeDisabled();

    await user.clear(motivo);
    await user.type(motivo, "  visita autorizada  ");
    expect(confirmar).toBeEnabled();

    await user.click(confirmar);
    expect(onConfirm).toHaveBeenCalledWith("visita autorizada");
  });

  it("mientras la orden viaja al ACS no se puede reenviar", () => {
    render(<DoorConfirmModal {...BASE} busy />);
    expect(screen.getByRole("button", { name: "Enviando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  });
});

describe("DoorConfirmModal · teclado y foco", () => {
  it("Esc cierra el diálogo", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<DoorConfirmModal {...BASE} onCancel={onCancel} />);

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Esc NO cierra con la orden ya viajando al ACS", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<DoorConfirmModal {...BASE} busy onCancel={onCancel} />);

    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("el `busy` que llega DESPUÉS de abrir también bloquea Esc", async () => {
    // Regresión: el listener de Esc se engancha una sola vez, así que si la
    // condición se leyera de la lambda capturada al montar, seguiría viendo
    // `busy: false` justo cuando la puerta está siendo accionada.
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { rerender } = render(<DoorConfirmModal {...BASE} onCancel={onCancel} />);

    rerender(<DoorConfirmModal {...BASE} busy onCancel={onCancel} />);
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("el tabulador no se escapa del diálogo", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Fuera del modal</button>
        <DoorConfirmModal {...BASE} />
      </>,
    );

    const dialogo = screen.getByRole("dialog");
    const fuera = screen.getByRole("button", { name: "Fuera del modal" });

    // Una vuelta completa y algo más: el foco nunca sale del diálogo.
    for (let i = 0; i < 10; i++) {
      await user.tab();
      expect(document.activeElement).not.toBe(fuera);
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }

    // Y hacia atrás desde el primero se va al último, no al documento.
    await user.tab({ shift: true });
    expect(dialogo.contains(document.activeElement)).toBe(true);
  });

  it("al abrir mueve el foco dentro y al cerrar lo devuelve a quien lo abrió", async () => {
    const user = userEvent.setup();

    function Anfitrion() {
      const [abierto, setAbierto] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setAbierto(true)}>
            Abrir puerta
          </button>
          <DoorConfirmModal
            {...BASE}
            open={abierto}
            onCancel={() => setAbierto(false)}
          />
        </>
      );
    }

    render(<Anfitrion />);
    const disparador = screen.getByRole("button", { name: "Abrir puerta" });

    await user.click(disparador);
    const dialogo = screen.getByRole("dialog");
    expect(dialogo.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(disparador);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(disparador);
  });
});
