import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RevisionesResponse } from "@/lib/revisiones-api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/erp/pizarra" }));

import EnEsperaRevisionView, { hrefRevisar } from "./EnEsperaRevisionView";

const hace = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const data: RevisionesResponse = {
  pendientes: [
    {
      activityId: 331,
      anNumber: "AN-0331",
      titulo: "Instalación de cámaras",
      estatus: "Por Validar",
      coreKind: "servicio",
      ticketTypeCustom: null,
      assignmentCharge: "ejecucion",
      prioridad: "ALTA",
      persona: { id: 12, nombre: "Iván Domínguez", avatarUrl: null, puesto: "Técnico" },
      enviadaAt: hace(30),
      correccion: false,
    },
    {
      activityId: 340,
      anNumber: "AN-0340",
      titulo: "Levantamiento en bodega",
      estatus: "Por Validar",
      coreKind: "tarea",
      ticketTypeCustom: "Levantamiento",
      assignmentCharge: "ejecucion",
      prioridad: null,
      persona: { id: 16, nombre: "Israel Ramos", avatarUrl: null, puesto: null },
      enviadaAt: hace(2),
      correccion: true,
    },
  ],
  revisadas: [
    {
      id: 90,
      activityId: 300,
      anNumber: "AN-0300",
      titulo: "Mantenimiento de DVR",
      estatus: "Finalizada",
      coreKind: "servicio",
      ticketTypeCustom: null,
      persona: { id: 12, nombre: "Iván Domínguez", avatarUrl: null, puesto: "Técnico" },
      decision: "APROBADA",
      calificacion: 4,
      observaciones: "Bien hecho",
      at: hace(5),
    },
  ],
};

function pintar(props: Partial<React.ComponentProps<typeof EnEsperaRevisionView>> = {}) {
  const onVer = vi.fn();
  const onRecargar = vi.fn();
  render(
    <EnEsperaRevisionView
      data={data}
      loading={false}
      error={null}
      onRecargar={onRecargar}
      ver="pendientes"
      onVer={onVer}
      {...props}
    />,
  );
  return { onVer, onRecargar };
}

describe("En espera de revisión", () => {
  it("«Revisar» abre las evidencias en el bloque de revisión, sabiendo de dónde vino", () => {
    expect(hrefRevisar(331)).toBe("/erp/actividades/331/evidencias?origen=revision#revision");
    expect(hrefRevisar(300, { tipo: "revisadas" })).toBe("/erp/actividades/300/evidencias?origen=revisadas#revision");
  });

  it("cada fila dice quién la envió, desde cuándo espera y lleva directo a revisar", () => {
    pintar();
    const tabla = screen.getByRole("region", { name: "Evidencias en espera de revisión" });
    expect(within(tabla).getByText("Instalación de cámaras")).toBeTruthy();
    expect(within(tabla).getAllByText("Iván Domínguez").length).toBeGreaterThan(0);
    expect(within(tabla).getByText("hace 1 día")).toBeTruthy();
    expect(within(tabla).getByText("hace 2 h")).toBeTruthy();
    expect(within(tabla).getByText("Corrección")).toBeTruthy();
    const revisar = screen.getByRole("link", { name: "Revisar la evidencia de Iván Domínguez en AN-0331" });
    expect(revisar.getAttribute("href")).toBe("/erp/actividades/331/evidencias?origen=revision#revision");
  });

  it("lo enviado no se pinta como atrasado: sin cifra de «más de un día» ni semáforo", () => {
    pintar();
    expect(screen.getByText("entregadas: ya cuentan como cumplidas")).toBeTruthy();
    expect(screen.queryByText(/más de un día/)).toBeNull();
    expect(screen.queryByText(/atiéndelas/)).toBeNull();
    const tabla = screen.getByRole("region", { name: "Evidencias en espera de revisión" });
    expect(within(tabla).getByText("Enviada")).toBeTruthy();
  });

  it("tocar la fila abre la actividad con el origen", () => {
    pintar();
    fireEvent.click(screen.getByText("Levantamiento en bodega"));
    expect(push).toHaveBeenCalledWith("/erp/actividades/340?origen=revision");
  });

  it("la búsqueda filtra por persona", () => {
    pintar();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar folio, actividad o persona" }), {
      target: { value: "israel" },
    });
    expect(screen.queryByText("Instalación de cámaras")).toBeNull();
    expect(screen.getByText("Levantamiento en bodega")).toBeTruthy();
  });

  it("«Revisadas por ti» cambia de lista", () => {
    const { onVer } = pintar();
    fireEvent.click(screen.getByRole("button", { name: /Revisadas por ti/ }));
    expect(onVer).toHaveBeenCalledWith("revisadas");
  });

  it("en revisadas, la decisión y la calificación, y «Ver» vuelve a «Revisadas»", () => {
    pintar({ ver: "revisadas" });
    expect(screen.getByText("Aprobada")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Eficiencia 4 de 5" })).toBeTruthy();
    const ver = screen.getByRole("link", { name: "Ver la revisión de Iván Domínguez en AN-0300" });
    expect(ver.getAttribute("href")).toBe("/erp/actividades/300/evidencias?origen=revisadas#revision");
  });

  it("sin pendientes lo dice, sin tabla vacía", () => {
    pintar({ data: { pendientes: [], revisadas: [] } });
    expect(screen.getByText("Nada espera tu revisión")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Evidencias en espera de revisión" })).toBeNull();
  });

  it("si falla la primera carga, ofrece reintentar", () => {
    const { onRecargar } = pintar({ data: null, error: "Sin conexión" });
    expect(screen.getByRole("alert").textContent).toContain("Sin conexión");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRecargar).toHaveBeenCalled();
  });
});
