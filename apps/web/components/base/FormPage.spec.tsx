import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormPage, PendingList, focusField } from "./FormPage";
import { Field, FormSection, Input } from "./campos";

function Formulario({ onSubmit, loading = false }: { onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void; loading?: boolean }) {
  return (
    <FormPage
      title="Nueva actividad"
      description="Los campos con * son obligatorios."
      back={{ href: "/erp/actividades", label: "Volver a Actividades" }}
      pendingTitle="Antes de crear"
      pending={[
        { id: "titulo", label: "Tipo y título", done: true, fieldId: "f-titulo" },
        { id: "hora", label: "Hora de inicio válida", error: true, fieldId: "f-hora" },
        { id: "cliente", label: "Cliente y sitio", fieldId: "f-cliente" },
      ]}
      status="Borrador guardado hace 5 s"
      onSubmit={onSubmit}
      onCancel={() => {}}
      submitLabel="Crear actividad"
      loading={loading}
    >
      <FormSection step={1} title="¿Qué se va a hacer?" description="El tipo define la evidencia." columns={2}>
        <Field label="Título" required hint="Lo que verá el técnico.">
          <Input id="f-titulo" defaultValue="Mantenimiento" />
        </Field>
        <Field label="Hora de inicio" required error="Esa hora ya pasó.">
          <Input id="f-hora" type="time" defaultValue="11:00" />
        </Field>
      </FormSection>
      <FormSection step={2} title="¿Dónde y para quién?">
        <Field label="Cliente" required>
          <Input id="f-cliente" />
        </Field>
      </FormSection>
    </FormPage>
  );
}

describe("FormPage · plantilla de formulario", () => {
  it("pinta encabezado, secciones numeradas, obligatorios con *, ayuda y error que la reemplaza", () => {
    render(<Formulario onSubmit={(e) => e.preventDefault()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Nueva actividad" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a Actividades" })).toHaveAttribute("href", "/erp/actividades");
    expect(screen.getByRole("heading", { level: 2, name: "¿Qué se va a hacer?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "¿Dónde y para quién?" })).toBeInTheDocument();

    const titulo = screen.getByLabelText(/Título/);
    expect(titulo).toBeRequired();
    expect(screen.getByText("Lo que verá el técnico.")).toBeInTheDocument();

    const hora = screen.getByLabelText(/Hora de inicio/);
    expect(hora).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Esa hora ya pasó.");
  });

  it("la lista de pendientes cuenta lo que falta y al pulsar enfoca el campo", async () => {
    render(<Formulario onSubmit={(e) => e.preventDefault()} />);
    const lista = screen.getByRole("region", { name: "Antes de crear" });
    expect(within(lista).getByText("2 pendientes")).toBeInTheDocument();
    expect(within(lista).getByRole("button", { name: /Tipo y título/ })).toHaveTextContent("hecho");
    expect(within(lista).getByRole("button", { name: /Hora de inicio válida/ })).toHaveTextContent("con error");

    await userEvent.click(within(lista).getByRole("button", { name: /Hora de inicio válida/ }));
    expect(screen.getByLabelText(/Hora de inicio/)).toHaveFocus();

    await userEvent.click(within(lista).getByRole("button", { name: /Cliente y sitio/ }));
    expect(screen.getByLabelText(/Cliente/)).toHaveFocus();
  });

  it("el pie fijo trae Cancelar y Guardar; Guardar envía el formulario y con loading se bloquea", async () => {
    const onSubmit = vi.fn((e: React.FormEvent<HTMLFormElement>) => e.preventDefault());
    const { rerender } = render(<Formulario onSubmit={onSubmit} />);
    expect(screen.getByText("Borrador guardado hace 5 s")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    const guardar = screen.getByRole("button", { name: "Crear actividad" });
    expect(guardar).toHaveAttribute("type", "submit");
    await userEvent.click(guardar);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    rerender(<Formulario onSubmit={onSubmit} loading />);
    expect(screen.getByRole("button", { name: "Crear actividad" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Crear actividad" })).toHaveAttribute("aria-busy", "true");
  });

  it("acepta un pie propio por el slot `footer` y un error general", () => {
    render(
      <FormPage title="Editar" footer={<div>pie propio</div>} error="No se pudo guardar.">
        <p>campos</p>
      </FormPage>,
    );
    expect(screen.getByText("pie propio")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo guardar.");
  });
});

describe("PendingList · suelta", () => {
  it("con todo hecho anuncia «Todo listo» y llama a onSelect", async () => {
    const onSelect = vi.fn();
    render(<PendingList title="Checklist" items={[{ id: "a", label: "Cliente", done: true }]} onSelect={onSelect} />);
    expect(screen.getByText("Todo listo")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Cliente/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });

  it("focusField devuelve false si el campo no existe", () => {
    expect(focusField("no-existe")).toBe(false);
  });
});
