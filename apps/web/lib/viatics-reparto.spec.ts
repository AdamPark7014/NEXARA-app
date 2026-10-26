import { describe, expect, it, vi, afterEach } from "vitest";
import { centavosViatico, frasePartesSuman, pesosViatico, revisarCuadreReparto } from "./viatics-display";
import { listViaticsForActivity } from "./ops-activities-api";

const parte = (actividadId: string, monto: string) => ({ actividadId, monto, nota: "" });

describe("cuadre del reparto en la pantalla", () => {
  it("no dice nada cuando no hay reparto", () => {
    expect(revisarCuadreReparto([], 1200)).toBeUndefined();
  });

  it("acepta un reparto que suma el total exacto", () => {
    expect(revisarCuadreReparto([parte("101", "700"), parte("202", "500")], 1200)).toBeUndefined();
  });

  it("dice cuánto falta, con la cifra, no «revisa los datos»", () => {
    const aviso = revisarCuadreReparto([parte("101", "700"), parte("202", "300")], 1200);
    expect(aviso).toContain("Faltan");
    expect(aviso).toContain("200.00");
  });

  it("dice cuánto sobra", () => {
    const aviso = revisarCuadreReparto([parte("101", "900"), parte("202", "500")], 1200);
    expect(aviso).toContain("Sobran");
    expect(aviso).toContain("200.00");
  });

  it("no se deja engañar por la coma flotante", () => {
    // 0.1 + 0.2 !== 0.3 en binario: en float, este reparto legítimo saldría mal.
    expect(revisarCuadreReparto([parte("101", "0.10"), parte("202", "0.20")], 0.3)).toBeUndefined();
  });

  it("pide la actividad de una parte a medio llenar", () => {
    const aviso = revisarCuadreReparto([parte("", "1200")], 1200);
    expect(aviso).toContain("actividad");
  });

  it("pide la actividad que falta en una sola frase", () => {
    // El texto viejo eran dos frases. El hecho es el mismo: cada parte carga
    // a una actividad, y la que no la trae se completa o se quita.
    const viejo =
      "Cada parte necesita la actividad a la que se carga. Completa la que falta o quítala.";
    const aviso = revisarCuadreReparto([parte("", "1200"), parte("  ", "0")], 1200);
    const frases = (texto: string) => texto.split(/(?<=[.!?])\s+/).filter((f) => f.trim());
    expect(frases(viejo)).toEqual([
      "Cada parte necesita la actividad a la que se carga.",
      "Completa la que falta o quítala.",
    ]);
    expect(aviso).toBe(
      "Cada parte necesita la actividad a la que se carga: completa la que falta o quítala.",
    );
    expect(frases(aviso ?? "")).toHaveLength(1);
    expect(aviso).not.toBe(viejo);
    expect(aviso).toContain("la actividad a la que se carga");
    expect(aviso).toContain("completa la que falta o quítala");
    expect(aviso).not.toContain("Faltan");
    expect(aviso).not.toContain("Sobran");
  });

  it("con una parte dice «la parte suma» y con más, «las N partes suman»", () => {
    const viejo = "las 1 partes suman";
    expect(frasePartesSuman(1)).toBe("la parte suma");
    expect(frasePartesSuman(1)).not.toContain(viejo);
    expect(`Cuadra: ${frasePartesSuman(1)} $1,200.00.`).toBe("Cuadra: la parte suma $1,200.00.");
    expect(`Cuadra: ${frasePartesSuman(1)} $1,200.00.`).not.toContain(viejo);
    expect(frasePartesSuman(2)).toBe("las 2 partes suman");
    expect(frasePartesSuman(4)).toBe("las 4 partes suman");
  });

  it("cuenta en centavos enteros", () => {
    expect(centavosViatico("1200.55")).toBe(120055);
    expect(centavosViatico("")).toBe(0);
    expect(pesosViatico(120055)).toContain("1,200.55");
  });
});

describe("viáticos que carga una actividad", () => {
  afterEach(() => vi.unstubAllGlobals());

  const responder = (filas: unknown[]) =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(filas),
        json: async () => filas,
      }),
    );

  it("incluye el viático repartido aunque cuelgue de otra actividad", async () => {
    // El viaje cubrió dos servicios: la OT 202 paga su mitad aunque el viático
    // esté colgado de la 101. Antes se veía «sin viáticos».
    responder([
      {
        id: 1,
        montoSolicitado: 1200,
        estatus: "Aprobado",
        actividadId: 101,
        repartos: [
          { id: 1, actividadId: 101, monto: 700 },
          { id: 2, actividadId: 202, monto: 500 },
        ],
      },
    ]);
    const filas = await listViaticsForActivity("tok", 202);
    expect(filas).toHaveLength(1);
    expect(filas[0].montoEnEstaActividad).toBe(500);
  });

  it("a la actividad dueña le carga solo su parte, no el total", async () => {
    responder([
      {
        id: 1,
        montoSolicitado: 1200,
        estatus: "Aprobado",
        actividadId: 101,
        repartos: [
          { id: 1, actividadId: 101, monto: 700 },
          { id: 2, actividadId: 202, monto: 500 },
        ],
      },
    ]);
    const filas = await listViaticsForActivity("tok", 101);
    expect(filas[0].montoEnEstaActividad).toBe(700);
  });

  it("sin reparto, la actividad carga el viático entero como siempre", async () => {
    responder([{ id: 1, montoSolicitado: 1200, estatus: "Aprobado", actividadId: 101 }]);
    const filas = await listViaticsForActivity("tok", 101);
    expect(filas[0].montoEnEstaActividad).toBe(1200);
  });

  it("deja fuera los viáticos de otras actividades", async () => {
    responder([{ id: 1, montoSolicitado: 1200, estatus: "Aprobado", actividadId: 999 }]);
    expect(await listViaticsForActivity("tok", 101)).toHaveLength(0);
  });
});
