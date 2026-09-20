import { describe, expect, it } from "vitest";
import { filtrarAsignadasPorMi } from "./AsignadasPorMiView";
import type { AsignadaPorMiItem } from "@/lib/team-board-api";

function item(parcial: Partial<AsignadaPorMiItem> & Pick<AsignadaPorMiItem, "id" | "semaforo">): AsignadaPorMiItem {
  return {
    anNumber: `AN-${parcial.id}`,
    titulo: "Tarea",
    estatus: "En Proceso",
    coreKind: "tarea",
    fechaAsignacion: "2026-09-01T00:00:00.000Z",
    fechaMaxima: null,
    fechaFinalizacion: null,
    persona: { id: parcial.persona?.id ?? 1, nombre: parcial.persona?.nombre ?? "Ana", avatarUrl: null, puesto: null },
    prioridad: "MEDIA",
    minutosPlan: 60,
    minutosReales: null,
    excedida: false,
    terminada: false,
    retirado: false,
    aceptacion: "ACEPTADA",
    motivoRechazo: null,
    ...parcial,
  };
}

describe("filtrarAsignadasPorMi", () => {
  const base = [
    item({ id: 1, semaforo: "rojo", excedida: true, terminada: false, persona: { id: 10, nombre: "Ana", avatarUrl: null, puesto: null } }),
    item({ id: 2, semaforo: "verde", excedida: false, terminada: true, persona: { id: 20, nombre: "Luis", avatarUrl: null, puesto: null } }),
    item({ id: 3, semaforo: "amarillo", excedida: false, terminada: false, persona: { id: 10, nombre: "Ana", avatarUrl: null, puesto: null } }),
  ];

  it("sin filtros devuelve todo", () => {
    expect(
      filtrarAsignadasPorMi(base, { semaforo: "todos", excedida: "todos", terminada: "todos", personaId: null }).map(
        (a) => a.id,
      ),
    ).toEqual([1, 2, 3]);
  });

  it("filtra por semáforo", () => {
    expect(
      filtrarAsignadasPorMi(base, { semaforo: "rojo", excedida: "todos", terminada: "todos", personaId: null }).map(
        (a) => a.id,
      ),
    ).toEqual([1]);
  });

  it("filtra excedida y terminada", () => {
    expect(
      filtrarAsignadasPorMi(base, { semaforo: "todos", excedida: "si", terminada: "todos", personaId: null }).map(
        (a) => a.id,
      ),
    ).toEqual([1]);
    expect(
      filtrarAsignadasPorMi(base, { semaforo: "todos", excedida: "todos", terminada: "si", personaId: null }).map(
        (a) => a.id,
      ),
    ).toEqual([2]);
  });

  it("filtra por persona", () => {
    expect(
      filtrarAsignadasPorMi(base, { semaforo: "todos", excedida: "todos", terminada: "todos", personaId: 10 }).map(
        (a) => a.id,
      ),
    ).toEqual([1, 3]);
  });
});
