import React, { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterButton, FilterChip, FilterChips, ListFooter, ModulePage, ModuleToolbar, Pager, ViewSwitch } from "./ModulePage";
import { SearchInput } from "./estados";
import { Stat, StatRow } from "./piezas";
import { Tabs } from "./PageHead";

describe("ModulePage · plantilla de módulo", () => {
  it("pinta encabezado, pestañas, KPI, barra, contenido y pie en ese orden", () => {
    render(
      <ModulePage
        title="Actividades"
        description="Equipo del día."
        breadcrumbs={[{ label: "Hoy", href: "/erp" }, { label: "Actividades" }]}
        primaryAction={<button type="button">Nueva actividad</button>}
        tabs={<Tabs items={[{ id: "equipo", label: "Mi equipo", count: 38 }]} value="equipo" onChange={() => {}} ariaLabel="Vistas" />}
        stats={
          <StatRow ariaLabel="Cifras">
            <Stat label="Para hoy" value={38} />
          </StatRow>
        }
        toolbar={<ModuleToolbar search={<SearchInput placeholder="Buscar folio" />} />}
        footer={<ListFooter from={1} to={6} total={38} />}
        listLabel="Lista de actividades"
      >
        <table>
          <tbody>
            <tr>
              <td>Fila 1</td>
            </tr>
          </tbody>
        </table>
      </ModulePage>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Actividades" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Ruta de la página" })).toHaveTextContent("Hoy");
    expect(screen.getByRole("button", { name: "Nueva actividad" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Mi equipo/ })).toHaveTextContent("38");
    expect(screen.getByText("Para hoy")).toBeInTheDocument();

    const lista = screen.getByRole("region", { name: "Lista de actividades" });
    expect(within(lista).getByRole("search")).toBeInTheDocument();
    expect(within(lista).getByPlaceholderText("Buscar folio")).toBeInTheDocument();
    expect(within(lista).getByText("Fila 1")).toBeInTheDocument();
    expect(within(lista).getByText("Mostrando 1 a 6 de 38")).toBeInTheDocument();

    // Orden: título antes que la lista; dentro de la lista, barra → contenido → pie.
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const barra = within(lista).getByRole("search");
    const pie = within(lista).getByText("Mostrando 1 a 6 de 38");
    expect(barra.compareDocumentPosition(pie) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("acepta un encabezado propio por el slot `head`", () => {
    render(
      <ModulePage head={<h1>Mi encabezado</h1>}>
        <p>contenido</p>
      </ModulePage>,
    );
    expect(screen.getByRole("heading", { name: "Mi encabezado" })).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("con `empty` pinta el vacío con su acción y esconde a los hijos", async () => {
    const onNueva = vi.fn();
    render(
      <ModulePage
        title="Actividades"
        empty
        emptyState={{
          title: "Todo al día",
          description: "Ninguna actividad atrasada.",
          action: (
            <button type="button" onClick={onNueva}>
              Nueva actividad
            </button>
          ),
        }}
      >
        <p>no debería verse</p>
      </ModulePage>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Todo al día");
    expect(screen.getByText("Ninguna actividad atrasada.")).toBeInTheDocument();
    expect(screen.queryByText("no debería verse")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Nueva actividad" }));
    expect(onNueva).toHaveBeenCalledTimes(1);
  });

  it("con `loading` pinta renglones esqueleto y marca la tarjeta ocupada", () => {
    render(
      <ModulePage title="Actividades" loading loadingRows={3} listLabel="Lista">
        <p>no debería verse</p>
      </ModulePage>,
    );
    expect(screen.getByRole("region", { name: "Lista" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Cargando")).toBeInTheDocument();
    expect(screen.queryByText("no debería verse")).not.toBeInTheDocument();
  });
});

describe("ModulePage · chips, filtro, vista y paginador", () => {
  it("los chips son botones con aria-pressed, contador y punto de tono", async () => {
    function Harness() {
      const [f, setF] = useState("todas");
      return (
        <FilterChips ariaLabel="Estado">
          <FilterChip active={f === "todas"} count={38} onClick={() => setF("todas")}>
            Todas
          </FilterChip>
          <FilterChip active={f === "atrasadas"} count={3} dot="danger" onClick={() => setF("atrasadas")}>
            Atrasadas
          </FilterChip>
        </FilterChips>
      );
    }
    render(<Harness />);
    const grupo = screen.getByRole("group", { name: "Estado" });
    const todas = within(grupo).getByRole("button", { name: /Todas/ });
    const atrasadas = within(grupo).getByRole("button", { name: /Atrasadas/ });
    expect(todas).toHaveAttribute("aria-pressed", "true");
    expect(todas).toHaveTextContent("38");
    expect(atrasadas).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(atrasadas);
    expect(atrasadas).toHaveAttribute("aria-pressed", "true");
    expect(todas).toHaveAttribute("aria-pressed", "false");
  });

  it("un chip con onRemove es un filtro aplicado con su botón de quitar", async () => {
    const onRemove = vi.fn();
    render(
      <FilterChip onRemove={onRemove} removeLabel="Quitar responsable">
        Responsable: <b>José A.</b>
      </FilterChip>,
    );
    expect(screen.queryByRole("button", { name: /Responsable/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Quitar responsable" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("«Filtro» muestra cuántos filtros avanzados hay", () => {
    render(<FilterButton count={2} />);
    expect(screen.getByRole("button", { name: /Filtro/ })).toHaveTextContent("2");
  });

  it("el selector de vista cambia de lista a mapa", async () => {
    const onChange = vi.fn();
    render(<ViewSwitch value="lista" onChange={onChange} />);
    const grupo = screen.getByRole("group", { name: "Vista" });
    expect(within(grupo).getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(grupo).getByRole("button", { name: "Mapa" }));
    expect(onChange).toHaveBeenCalledWith("mapa");
  });

  it("el paginador marca la página actual, bloquea los extremos y comprime las de en medio", async () => {
    const onChange = vi.fn();
    render(<Pager page={4} pages={12} onChange={onChange} />);
    const nav = screen.getByRole("navigation", { name: "Páginas" });
    expect(within(nav).getByRole("button", { name: "Página 4" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "Página 12" })).toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Página 8" })).not.toBeInTheDocument();
    await userEvent.click(within(nav).getByRole("button", { name: "Página siguiente" }));
    expect(onChange).toHaveBeenCalledWith(5);

    const { unmount } = render(<Pager page={1} pages={3} onChange={onChange} />);
    expect(screen.getAllByRole("button", { name: "Página anterior" })[1]).toBeDisabled();
    unmount();
  });
});
