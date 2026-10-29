import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityDetail } from "@/lib/ops-activities-api";

const nav = vi.hoisted(() => ({ pathname: "/erp/actividades/7" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/UserContext", () => ({
  useUser: () => ({ user: { id: 8, email: "operaciones@nexara.com.mx", token: "tok" }, token: "tok" }),
}));
// El costo pide sus propios datos; aquí solo importa la cabecera.
vi.mock("./CostoActividad", () => ({ default: () => null }));

const actividad: ActivityDetail = {
  id: 7,
  anNumber: "AN-0007",
  titulo: "Mantenimiento de DVR",
  estatus: "Por Validar",
  fechaAsignacion: "2026-10-28T15:00:00.000Z",
  responsable: { id: 12, nombre: "Iván Domínguez" },
  assignees: [{ id: 1, userId: 12, rol: "TECNICO", user: { id: 12, nombre: "Iván Domínguez" } }],
};
vi.mock("@/lib/ops-activities-api", async (original) => ({
  ...(await original<typeof import("@/lib/ops-activities-api")>()),
  getActivity: vi.fn(async () => actividad),
}));

import ActivityDetailShell from "./ActivityDetailShell";

function abrir(url: string) {
  window.history.replaceState(null, "", url);
  nav.pathname = url.split(/[?#]/)[0]!;
  return render(
    <ActivityDetailShell id="7" core>
      <p>contenido</p>
    </ActivityDetailShell>,
  );
}

/** El enlace de regreso es la primera miga de la ficha. */
async function regreso() {
  await screen.findByText("Mantenimiento de DVR");
  const migas = screen.getByRole("navigation", { name: /ruta/i });
  return migas.querySelector("a")!;
}

describe("«‹ regresar» del detalle de actividad (Core)", () => {
  beforeEach(() => {
    nav.pathname = "/erp/actividades/7";
  });
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("desde «En espera de revisión» vuelve a esa pestaña, no a la lista general", async () => {
    abrir("/erp/actividades/7?origen=revision");
    const a = await regreso();
    await waitFor(() => expect(a.getAttribute("href")).toBe("/erp/pizarra?vista=revision"));
    expect(a.textContent).toContain("En espera de revisión");
  });

  it("las pestañas Detalle, Evidencias e Historial conservan el origen y la activa sigue marcada", async () => {
    abrir("/erp/actividades/7/evidencias?origen=revision");
    nav.pathname = "/erp/actividades/7/evidencias";
    await screen.findByText("Mantenimiento de DVR");
    const pestanas = screen.getByRole("navigation", { name: "Secciones de la actividad" });
    await waitFor(() => {
      const hrefs = Array.from(pestanas.querySelectorAll("a")).map((x) => x.getAttribute("href"));
      expect(hrefs).toEqual([
        "/erp/actividades/7?origen=revision",
        "/erp/actividades/7/evidencias?origen=revision",
        "/erp/actividades/7/historial?origen=revision",
      ]);
    });
    const activa = pestanas.querySelector('[aria-current="page"]');
    expect(activa?.textContent).toContain("Evidencias");
  });

  it("desde el historial de una persona vuelve a su historial, con su nombre", async () => {
    abrir("/erp/actividades/7?origen=historial&persona=12");
    const a = await regreso();
    await waitFor(() => expect(a.getAttribute("href")).toBe("/erp/pizarra/12?pestana=historial"));
    expect(a.textContent).toContain("Historial de Iván");
  });

  it("«Revisar evidencias» (por validar) lleva el origen hasta la revisión", async () => {
    abrir("/erp/actividades/7?origen=revision");
    await screen.findByText("Mantenimiento de DVR");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Revisar evidencias/ }).getAttribute("href")).toBe(
        "/erp/actividades/7/evidencias?origen=revision#revision",
      ),
    );
  });

  it("sin origen (pizarra, Mis actividades) sigue volviendo a la pizarra", async () => {
    abrir("/erp/actividades/7");
    const a = await regreso();
    expect(a.getAttribute("href")).toBe("/erp/pizarra");
    expect(a.textContent).toContain("Pizarra");
  });
});
