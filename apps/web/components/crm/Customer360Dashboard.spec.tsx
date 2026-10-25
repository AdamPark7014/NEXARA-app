import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClientSnapshot, ClientSnapshotStats } from "@/lib/client-snapshot-api";
import type { SalesClient } from "@/lib/sales-api";
import Customer360Dashboard from "./Customer360Dashboard";
import s from "./Customer360Dashboard.module.css";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/CrossPanelLink", () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const stats: ClientSnapshotStats = {
  branches: 1,
  activities: 1,
  operationalProjects: 1,
  maintenanceContracts: 0,
  ticketRequests: 1,
  activitiesLast90d: 1,
  activitiesOpen: 1,
  opportunitiesOpen: 1,
  pipelineValue: 180000,
  activeContracts: 0,
  monthlyContractRevenue: 0,
  pendingInvoices: 0,
  totalSalesProjects: 0,
};

const snapshot: ClientSnapshot = {
  salesClient: { id: 7, name: "Grupo Centro" },
  linked: true,
  stats,
  activities: [
    {
      id: 42,
      anNumber: "AN-1042",
      titulo: "Cambiar el NVR",
      estatus: "En curso",
      branchName: "Sucursal Centro",
    },
  ],
  operationalProjects: [
    { id: 9, title: "Cámaras de la sucursal", projectType: "Obra", status: "En curso" },
  ],
  salesProjects: [],
  maintenanceContracts: [],
  ticketRequests: [
    { id: 3, description: "La puerta no abre", status: "Abierto", urgency: "Alta" },
  ],
  quotes: [],
  opportunities: [{ id: 5, title: "Ampliación CCTV", stage: "PROPOSAL", value: 180000 }],
  invoices: [],
};

const client: SalesClient = { id: 7, name: "Grupo Centro", status: "Activo" };

describe("ficha 360", () => {
  it("un dato por renglón: el texto viejo juntaba dos datos en la misma línea", () => {
    const viejoActividad = "AN-1042 · Cambiar el NVR";
    const viejoSucursal = "En curso · Sucursal Centro";
    const viejoObra = "Obra · En curso";
    const viejoTicket = "Abierto · Alta";
    const viejos = [viejoActividad, viejoSucursal, viejoObra, viejoTicket];

    const { container } = render(
      <Customer360Dashboard client={client} snapshot={snapshot} timeline={[]} />,
    );

    const lineas = [...container.querySelectorAll(`.${s.linea}`)];
    const datosDe = (nodo: Element) =>
      [...nodo.querySelectorAll(`.${s.dato}`)].map((el) => el.textContent);

    expect(lineas).toHaveLength(viejos.length);
    expect(lineas.map((nodo) => datosDe(nodo).join(" · "))).toEqual([
      viejoObra,
      viejoActividad,
      viejoSucursal,
      viejoTicket,
    ]);

    for (const linea of lineas) {
      const datos = datosDe(linea);
      const viejo = datos.join(" · ");
      expect(viejos).toContain(viejo);
      expect(datos).toEqual(viejo.split(" · "));
      expect(linea.textContent?.includes(viejo)).toBe(true);
      expect(datos.some((dato) => dato === viejo)).toBe(false);
    }

    expect(screen.getByText("AN-1042")).toBeInTheDocument();
    expect(screen.getByText("Cambiar el NVR")).toBeInTheDocument();
    expect(screen.getByText("Sucursal Centro")).toBeInTheDocument();
    expect(screen.getByText("Obra")).toBeInTheDocument();
    expect(screen.getByText("Abierto")).toBeInTheDocument();
    expect(screen.getByText("Alta")).toBeInTheDocument();
    expect(screen.getAllByText("En curso")).toHaveLength(2);

    expect(screen.getByRole("heading", { name: "Pipeline comercial" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Proyectos en campo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Actividades abiertas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tickets y solicitudes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Resumen operativo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Timeline unificada" })).toBeInTheDocument();
    expect(screen.getByText("Cámaras de la sucursal")).toBeInTheDocument();
    expect(screen.getByText("La puerta no abre")).toBeInTheDocument();
    expect(screen.getByText("Ampliación CCTV")).toBeInTheDocument();
  });
});
