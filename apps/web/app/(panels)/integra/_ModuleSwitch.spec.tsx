import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModuleSwitch } from "./_ModuleSwitch";

/**
 * Antes eran botones con `opacity: .35` y texto tachado. Un lector de pantalla
 * no anuncia una opacidad, y ese 0.35 dejaba la etiqueta por debajo del
 * contraste mínimo AA: el estado del módulo no se podía ni oír ni leer.
 */

describe("ModuleSwitch", () => {
  it("es un conmutador de verdad y anuncia su estado", () => {
    render(<ModuleSwitch label="Personas" checked onToggle={vi.fn()} />);
    const conmutador = screen.getByRole("switch", { name: /Personas/ });
    expect(conmutador).toHaveAttribute("aria-checked", "true");
  });

  it("apagado se anuncia apagado, no «deshabilitado»", () => {
    render(<ModuleSwitch label="Vehículos" checked={false} onToggle={vi.fn()} />);
    const conmutador = screen.getByRole("switch", { name: /Vehículos/ });
    expect(conmutador).toHaveAttribute("aria-checked", "false");
    expect(conmutador).toBeEnabled();
  });

  it("el estado también se lee con la vista, en texto y no en opacidad", () => {
    const { rerender } = render(<ModuleSwitch label="Video" checked onToggle={vi.fn()} />);
    expect(screen.getByRole("switch")).toHaveTextContent("Visible");

    rerender(<ModuleSwitch label="Video" checked={false} onToggle={vi.fn()} />);
    expect(screen.getByRole("switch")).toHaveTextContent("Oculto");
  });

  it("avisa por qué un módulo no se puede tocar en vez de solo apagarlo", () => {
    render(
      <ModuleSwitch
        label="ANPR"
        checked={false}
        disabled
        lockedTag="Artemis"
        lockedReason="Este módulo solo existe en HikCentral (Artemis)."
        onToggle={vi.fn()}
      />,
    );
    const conmutador = screen.getByRole("switch");
    expect(conmutador).toBeDisabled();
    expect(conmutador).toHaveTextContent("Artemis");
    expect(conmutador).toHaveAttribute(
      "title",
      "Este módulo solo existe en HikCentral (Artemis).",
    );
    // El motivo va enlazado con aria-describedby, no solo en el `title`.
    expect(conmutador).toHaveAttribute("aria-describedby");
  });

  it("se acciona con el teclado y avisa una sola vez por pulsación", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<ModuleSwitch label="Alarmas" checked onToggle={onToggle} />);

    await user.tab();
    expect(screen.getByRole("switch")).toHaveFocus();

    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("bloqueado no dispara el cambio ni con clic", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<ModuleSwitch label="Visitas" checked={false} disabled onToggle={onToggle} />);

    await user.click(screen.getByRole("switch"));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
