import { describe, expect, it, vi } from "vitest";
import {
  conSenal,
  dispositivoDePista,
  elegirMicrofono,
  esVirtual,
  nombreMicrofono,
  siguientesCandidatos,
  type Dispositivo,
  type Medicion,
} from "./microfono";

/** Lo que vio Chrome en la PC de Adam (23-10-2026). */
const ADAM: Dispositivo[] = [
  { deviceId: "default", label: "Predeterminado - Varios micrófonos (Realtek(R) Audio)", kind: "audioinput" },
  { deviceId: "communications", label: "Comunicaciones - Varios micrófonos (Realtek(R) Audio)", kind: "audioinput" },
  { deviceId: "cable", label: "Line 1 (Virtual Audio Cable)", kind: "audioinput" },
  { deviceId: "realtek", label: "Varios micrófonos (Realtek(R) Audio)", kind: "audioinput" },
  { deviceId: "bocinas", label: "Bocinas (Realtek)", kind: "audiooutput" },
];

/** Pista falsa: etiqueta y deviceId que reporta el navegador. */
function stream(label: string, deviceId: string) {
  const track = { label, getSettings: () => ({ deviceId }), stop: vi.fn() };
  return { getAudioTracks: () => [track], getTracks: () => [track], track } as unknown as MediaStream & { track: typeof track };
}

/** Qué entrega `getUserMedia` según el deviceId pedido (null = el del navegador). */
const ABRE: Record<string, [string, string]> = {
  "": ["Line 1 (Virtual Audio Cable)", "cable"],
  default: ["Predeterminado - Varios micrófonos (Realtek(R) Audio)", "default"],
  communications: ["Comunicaciones - Varios micrófonos (Realtek(R) Audio)", "communications"],
  cable: ["Line 1 (Virtual Audio Cable)", "cable"],
  realtek: ["Varios micrófonos (Realtek(R) Audio)", "realtek"],
};

function escenario(senal: Record<string, Medicion>, opciones: { recordado?: string | null; dispositivos?: Dispositivo[]; falla?: string[] } = {}) {
  const abiertos: Array<string | null> = [];
  const recordar = vi.fn();
  const abiertas: ReturnType<typeof stream>[] = [];
  const dep = {
    abrir: async (id: string | null) => {
      abiertos.push(id);
      if (opciones.falla?.includes(id ?? "")) throw Object.assign(new Error("no"), { name: "OverconstrainedError" });
      const [label, deviceId] = ABRE[id ?? ""];
      const s = stream(label, deviceId);
      abiertas.push(s);
      return s;
    },
    medir: async (s: MediaStream) => senal[s.getAudioTracks()[0].getSettings().deviceId!] ?? { muted: false, pico: 0.02 },
    listar: async () => opciones.dispositivos ?? ADAM,
    recordado: opciones.recordado ?? null,
    recordar,
  };
  return { dep, abiertos, recordar, abiertas };
}

describe("elegir micrófono", () => {
  it("reconoce cables virtuales y mezclas", () => {
    expect(esVirtual("Line 1 (Virtual Audio Cable)")).toBe(true);
    expect(esVirtual("Mezcla estéreo (Realtek)")).toBe(true);
    expect(esVirtual("Stereo Mix (Realtek)")).toBe(true);
    expect(esVirtual("CABLE Output (VB-Audio Virtual Cable)")).toBe(true);
    expect(esVirtual("Varios micrófonos (Realtek(R) Audio)")).toBe(false);
    expect(esVirtual("Micrófono (USB Audio Device)")).toBe(false);
  });

  it("cero exacto o pista silenciada no es señal; el ruido de fondo sí", () => {
    expect(conSenal({ muted: false, pico: 0 })).toBe(false);
    expect(conSenal({ muted: true, pico: 0.5 })).toBe(false);
    expect(conSenal({ muted: false, pico: 0.0004 })).toBe(true);
  });

  it("orden: default, communications, reales; las virtuales solo si no hay otra cosa", () => {
    expect(siguientesCandidatos(ADAM, new Set([null, "cable"]))).toEqual(["default", "communications", "realtek"]);
    const soloVirtual: Dispositivo[] = [{ deviceId: "cable", label: "Line 1 (Virtual Audio Cable)" }];
    expect(siguientesCandidatos(soloVirtual, new Set([null]))).toEqual(["cable"]);
    expect(siguientesCandidatos(ADAM, new Set([null, "cable", "default", "communications", "realtek"]))).toEqual([]);
  });

  it("caso de Adam: el navegador da el cable mudo y se queda con el Realtek predeterminado", async () => {
    const { dep, abiertos, recordar, abiertas } = escenario({ cable: { muted: true, pico: 0 } });
    const r = await elegirMicrofono(dep);
    expect(abiertos).toEqual([null, "default"]);
    expect(r.sinSenal).toBe(false);
    expect(r.dispositivo?.deviceId).toBe("realtek");
    expect(recordar).toHaveBeenCalledWith("realtek");
    expect(abiertas[0].track.stop).toHaveBeenCalled(); // el cable se soltó
  });

  it("usa primero el recordado si sigue existiendo y suena", async () => {
    const { dep, abiertos } = escenario({}, { recordado: "realtek" });
    const r = await elegirMicrofono(dep);
    expect(abiertos).toEqual(["realtek"]);
    expect(r.dispositivo?.deviceId).toBe("realtek");
  });

  it("si el recordado ya no está, sigue con el resto", async () => {
    const { dep, abiertos } = escenario({ cable: { muted: false, pico: 0 } }, { recordado: "viejo", falla: ["viejo"] });
    const r = await elegirMicrofono(dep);
    expect(abiertos).toEqual(["viejo", null, "default"]);
    expect(r.sinSenal).toBe(false);
  });

  it("si nada suena, graba con el mejor real y avisa", async () => {
    const mudo = { muted: false, pico: 0 };
    const { dep, abiertos, abiertas } = escenario({ cable: mudo, default: mudo, communications: mudo, realtek: mudo });
    const r = await elegirMicrofono(dep);
    expect(abiertos).toEqual([null, "default", "communications", "realtek"]);
    expect(r.sinSenal).toBe(true);
    expect(r.stream.getAudioTracks()[0].label).toContain("Realtek"); // no el cable virtual
    expect(abiertas.filter((s) => !s.track.stop.mock.calls.length)).toHaveLength(1); // solo queda uno abierto
  });

  it("sin permiso, el error llega a la pantalla", async () => {
    const { dep } = escenario({}, { falla: [""] });
    dep.abrir = async () => {
      throw Object.assign(new Error("denegado"), { name: "NotAllowedError" });
    };
    await expect(elegirMicrofono(dep)).rejects.toMatchObject({ name: "NotAllowedError" });
  });

  it("encuentra el dispositivo real detrás de un alias y limpia el nombre", () => {
    expect(dispositivoDePista("Predeterminado - Varios micrófonos (Realtek(R) Audio)", "default", ADAM)?.deviceId).toBe("realtek");
    expect(dispositivoDePista("Line 1 (Virtual Audio Cable)", "cable", ADAM)?.deviceId).toBe("cable");
    expect(nombreMicrofono("Comunicaciones - Varios micrófonos (Realtek(R) Audio)")).toBe("Varios micrófonos (Realtek(R) Audio)");
    expect(nombreMicrofono("")).toBe("el micrófono");
  });
});

describe("permiso del micrófono", () => {
  it("traduce el estado del navegador y cae a «desconocido» donde no hay permissions.query", async () => {
    const { estadoDePermiso, consultarPermisoMicrofono } = await import("./use-permiso-microfono");
    expect(estadoDePermiso("granted")).toBe("granted");
    expect(estadoDePermiso("prompt")).toBe("prompt");
    expect(estadoDePermiso("denied")).toBe("denied");
    expect(estadoDePermiso(undefined)).toBe("desconocido");

    const original = Object.getOwnPropertyDescriptor(globalThis.navigator, "permissions");
    Object.defineProperty(globalThis.navigator, "permissions", {
      configurable: true,
      value: { query: async () => ({ state: "denied", addEventListener() {}, removeEventListener() {} }) },
    });
    expect((await consultarPermisoMicrofono()).estado).toBe("denied");
    Object.defineProperty(globalThis.navigator, "permissions", {
      configurable: true,
      value: {
        query: async () => {
          throw new TypeError("'microphone' no es un nombre válido");
        },
      },
    });
    expect((await consultarPermisoMicrofono()).estado).toBe("desconocido");
    if (original) Object.defineProperty(globalThis.navigator, "permissions", original);
  });
});
