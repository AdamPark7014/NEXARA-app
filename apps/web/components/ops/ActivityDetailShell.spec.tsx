import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/UserContext", () => ({ useUser: () => ({ user: null, token: null }) }));

import { pasosDeActividad, quienMira } from "./ActivityDetailShell";
import type { ActivityDetail } from "@/lib/ops-activities-api";

const base: ActivityDetail = {
  id: 7,
  anNumber: "AN-0007",
  titulo: "Mantenimiento de DVR",
  estatus: "Asignada",
  fechaAsignacion: "2026-10-01T18:20:00.000Z",
};

const estados = (a: ActivityDetail) => pasosDeActividad(a).map((p) => `${p.id}:${p.state}`);

/**
 * Los pasos de la ficha salen solo de lo que ya trae la actividad: nada se inventa.
 * El actual es el último alcanzado; lo anterior queda hecho y lo que sigue, pendiente.
 */
describe("pasos de la ficha de actividad", () => {
  it("recién asignada: solo «Asignada» va en curso", () => {
    expect(estados(base)).toEqual([
      "asignada:current",
      "inicio:pending",
      "sitio:pending",
      "revision:pending",
      "completada:pending",
    ]);
  });

  it("con inicio real y llegada por foto de entrada, el actual es «En sitio»", () => {
    const a: ActivityDetail = {
      ...base,
      estatus: "En Proceso",
      assignees: [{ id: 1, userId: 3, inicioRealAt: "2026-10-02T15:35:00.000Z" }],
      activityEvidence: { entryPhotoUploadedAt: "2026-10-02T16:06:00.000Z", entryPhotoUrl: "/uploads/a.jpg" },
    };
    expect(estados(a)).toEqual([
      "asignada:done",
      "inicio:done",
      "sitio:current",
      "revision:pending",
      "completada:pending",
    ]);
  });

  it("por validar: «En revisión» en curso aunque falte la hora de llegada", () => {
    expect(estados({ ...base, estatus: "Por Validar" })).toEqual([
      "asignada:done",
      "inicio:done",
      "sitio:done",
      "revision:current",
      "completada:pending",
    ]);
  });

  it("finalizada: todo hecho", () => {
    expect(pasosDeActividad({ ...base, estatus: "Finalizada" }).every((p) => p.state === "done")).toBe(true);
  });

  it("cancelada: no hay paso en curso", () => {
    expect(pasosDeActividad({ ...base, estatus: "Cancelada" }).some((p) => p.state === "current")).toBe(false);
  });
});

describe("quién mira la actividad", () => {
  const conEquipo: ActivityDetail = {
    ...base,
    responsable: { id: 3, nombre: "José Antonio" },
    assignees: [{ id: 1, userId: 3, rol: "TECNICO", user: { id: 3, nombre: "José Antonio" }, aceptacion: "ACEPTADA" }],
  };

  it("quien la ejecuta en Core captura y, sin inicio real, puede iniciarla", () => {
    const r = quienMira(conEquipo, { id: 3, email: "tecnico@nexara.mx", token: "t" } as never, true);
    expect(r.puedeCapturar).toBe(true);
    expect(r.mostrarIniciar).toBe(true);
    expect(r.reparte).toBe(false);
  });

  it("en despacho, el LEAD solo reparte: no captura ni inicia", () => {
    const despacho: ActivityDetail = {
      ...conEquipo,
      assignmentCharge: "despacho",
      assignees: [{ id: 1, userId: 3, rol: "LEAD", user: { id: 3, nombre: "José Antonio" }, aceptacion: "ACEPTADA" }],
    };
    const r = quienMira(despacho, { id: 3, email: "lider@nexara.mx", token: "t" } as never, true);
    expect(r.reparte).toBe(true);
    expect(r.puedeCapturar).toBe(false);
    expect(r.mostrarIniciar).toBe(false);
  });

  it("alguien fuera del equipo no captura", () => {
    const r = quienMira(conEquipo, { id: 99, email: "otro@nexara.mx", token: "t" } as never, true);
    expect(r.puedeCapturar).toBe(false);
    expect(r.mostrarIniciar).toBe(false);
  });
});
