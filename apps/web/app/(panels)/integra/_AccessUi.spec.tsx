import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  DOOR_STATE_FILTERS,
  DoorStateBadge,
  RetryNotice,
  ShowingCount,
  diagLocal,
  doorState,
  doorStateLabel,
} from "./_AccessUi";
import { FalloApi, diagnosticar } from "./_fallosApi";

/**
 * Lo que se prueba aquí es que la consola no mienta: ni sobre cuántas puertas
 * hay, ni sobre el estado de una cerradura, ni sobre por qué falló algo.
 */

describe("doorState · el equipo caído manda", () => {
  it("una terminal fuera de línea no presenta su último estado conocido", () => {
    // El espejo puede tener `closed` de antes de la caída. Presentarlo como
    // estado actual es hacer que el operador confíe en una puerta que ya no
    // reporta.
    expect(doorState({ online: false, status: "closed" })).toBe("offline");
  });

  it("un estado que el backend no declara cae en «sin dato», no se inventa", () => {
    expect(doorState({ status: "forzada" })).toBe("unknown");
    expect(doorStateLabel("unknown")).toBe("Sin dato");
  });

  it("los estados del filtro son exactamente los que traduce el backend", () => {
    for (const opcion of DOOR_STATE_FILTERS) {
      expect(doorStateLabel(opcion.value)).toBe(opcion.label);
    }
  });

  it("la insignia anuncia el estado con texto, no solo con color", () => {
    render(<DoorStateBadge state="remain_open" />);
    expect(screen.getByText("Mantenida abierta")).toBeInTheDocument();
  });
});

describe("ShowingCount · el recorte deja de ser mudo", () => {
  it("dice cuántas se pintan de cuántas hay cuando se corta la lista", () => {
    render(<ShowingCount shown={24} matching={57} total={57} noun="puertas" />);
    const linea = screen.getByRole("status");
    expect(linea).toHaveTextContent("Mostrando 24 de 57 puertas");
  });

  it("con filtro activo confiesa además cuántas hay cargadas sin filtrar", () => {
    render(<ShowingCount shown={12} matching={12} total={57} noun="puertas" />);
    expect(screen.getByRole("status")).toHaveTextContent("57 cargadas sin filtro");
  });

  it("sin recorte no ofrece «ver más»: no hay nada más que ver", () => {
    render(
      <ShowingCount shown={9} matching={9} total={9} noun="equipos" onMore={vi.fn()} onAll={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /Ver más/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Ver las/ })).toBeNull();
  });

  it("con recorte ofrece ampliar y saltar al total exacto", async () => {
    const user = userEvent.setup();
    const onMore = vi.fn();
    const onAll = vi.fn();
    render(
      <ShowingCount
        shown={24}
        matching={57}
        total={57}
        noun="puertas"
        onMore={onMore}
        onAll={onAll}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ver más puertas" }));
    expect(onMore).toHaveBeenCalledTimes(1);

    // El botón dice el número real, no un «Ver todas» que no se puede auditar.
    await user.click(screen.getByRole("button", { name: "Ver las 57 puertas" }));
    expect(onAll).toHaveBeenCalledTimes(1);
  });

  it("sin datos no pinta un recuento de cero", () => {
    const { container } = render(
      <ShowingCount shown={0} matching={0} total={0} noun="personas" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RetryNotice · un fallo, un diagnóstico", () => {
  it("«no tienes permiso» sale en ámbar y sin botón de reintento", () => {
    const diag = diagnosticar(new FalloApi("Sin permiso", 403), "abrir la puerta");
    render(<RetryNotice diag={diag} onRetry={vi.fn()} />);

    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveAttribute("data-tone", "warn");
    expect(aviso).toHaveTextContent("No tienes permiso");
    // Reintentar un 403 es mandar al operador a un bucle.
    expect(screen.queryByRole("button", { name: /Reintentar/ })).toBeNull();
  });

  it("«el servidor no responde» sale en rojo y sí ofrece reintentar", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const diag = diagnosticar(new FalloApi("Failed to fetch", null), "cargar los sitios");
    render(<RetryNotice diag={diag} onRetry={onRetry} />);

    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveAttribute("data-tone", "danger");
    expect(aviso).toHaveTextContent("El servidor no responde");

    await user.click(screen.getByRole("button", { name: "Reintentar la carga" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("no son el mismo aviso: 403 y 502 se leen distinto", () => {
    const permiso = diagnosticar(new FalloApi("nope", 403), "cargar los sitios");
    const caido = diagnosticar(new FalloApi("bad gateway", 502), "cargar los sitios");
    expect(permiso.titulo).not.toBe(caido.titulo);
    expect(permiso.tono).toBe("warn");
    expect(caido.tono).toBe("danger");
  });

  it("mientras reintenta lo dice y no deja pulsar dos veces", () => {
    const diag = diagnosticar(new FalloApi("boom", 500), "cargar los sitios");
    render(<RetryNotice diag={diag} onRetry={vi.fn()} busy />);
    expect(screen.getByRole("button", { name: "Reintentar la carga" })).toBeDisabled();
  });

  it("un fallo comprobado en la propia pantalla no ofrece reintento", () => {
    const diag = diagLocal("No tienes permiso para accionar puertas", "Pídeselo a un admin.");
    render(<RetryNotice diag={diag} onRetry={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveAttribute("data-tone", "warn");
    expect(screen.queryByRole("button", { name: /Reintentar/ })).toBeNull();
  });
});
