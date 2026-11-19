import { afterEach, expect, it, vi } from "vitest";
import { erpFetch } from "./erp-api";
import { fetchTeamBoard } from "./team-board-api";
import { listAssignableUsers } from "./ops-activities-api";

vi.mock("./erp-api", () => ({ erpFetch: vi.fn() }));

const personas = [
  { id: 69, nombre: "Tere", email: "tere.garcia@nexara.com.mx", roleKey: "rh" },
  { id: 7, nombre: "Luis", email: "direccion.operaciones@nexara.com.mx", roleKey: "dir_operaciones" },
  { id: 8, nombre: "Liz", email: "lizeth.antonio@nexara.com.mx", roleKey: "coord_admin" },
  { id: 1, nombre: "Christian", email: "gerencia@nexara.com.mx", roleKey: "ceo" },
];

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("la pizarra conserva a Luis y Liz y excluye a RH y dirección", async () => {
  vi.mocked(erpFetch).mockResolvedValue({ users: personas, scope: "company" });
  const board = await fetchTeamBoard("sesion");
  expect(board.users.map((u) => u.id)).toEqual([7, 8]);
  expect(board.scope).toBe("company");
});

it("asignables filtra también respuestas de un servidor anterior", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(personas))));
  expect((await listAssignableUsers("sesion")).map((u) => u.id)).toEqual([7, 8]);
});

it("un error de pizarra se propaga; no se presenta como equipo vacío", async () => {
  vi.mocked(erpFetch).mockRejectedValue(new Error("Sin permiso para esta empresa"));
  await expect(fetchTeamBoard("sesion")).rejects.toThrow("Sin permiso");
});
