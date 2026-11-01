import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  subirParte: vi.fn(),
  estadoGrabacion: vi.fn(),
  concluirGrabacion: vi.fn(),
}));
const mic = vi.hoisted(() => ({ elegirMicrofonoNavegador: vi.fn(), listarMicrofonos: vi.fn() }));
const ruta = vi.hoisted(() => ({ actual: "/erp/clientes" }));

vi.mock("@/lib/grabacion-api", async (original) => ({ ...(await original<typeof import("@/lib/grabacion-api")>()), ...api }));
vi.mock("@/lib/microfono", async (original) => ({ ...(await original<typeof import("@/lib/microfono")>()), ...mic }));
vi.mock("@/lib/use-dictado", () => ({
  useDictado: () => ({ soportado: false, escuchando: false, parcial: "", error: null, iniciar: vi.fn(), detener: vi.fn() }),
}));
vi.mock("@/components/UserContext", () => ({ useUser: () => ({ token: "tok", user: { id: 1 } }) }));
vi.mock("next/navigation", () => ({ usePathname: () => ruta.actual }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
// La onda dibuja en un canvas, que jsdom no tiene.
vi.mock("@/app/(panels)/erp/reuniones/OndaVoz", () => ({ default: () => null }));

import GrabacionProvider, { useGrabacionActiva, useMotor } from "./GrabacionProvider";
import { guardarNota, leerNota, RETOMAR_SOLA_MS, type MensajeGrabacion } from "./grabacion-activa";

class GrabadoraFalsa {
  static todas: GrabadoraFalsa[] = [];
  static isTypeSupported = () => true;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(readonly stream: MediaStream) {
    GrabadoraFalsa.todas.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

class RelojFalso {
  static actual: RelojFalso | null = null;
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  terminado = false;
  constructor() {
    RelojFalso.actual = this;
  }
  postMessage() {}
  terminate() {
    this.terminado = true;
  }
}

class CanalFalso {
  static todos: CanalFalso[] = [];
  static enviados: MensajeGrabacion[] = [];
  onmessage: ((e: { data: MensajeGrabacion }) => void) | null = null;
  constructor() {
    CanalFalso.todos.push(this);
  }
  postMessage(m: MensajeGrabacion) {
    CanalFalso.enviados.push(m);
  }
  close() {}
}

function microfonoFalso() {
  const pista = { kind: "audio", label: "Mic", readyState: "live", enabled: true, muted: false, stop: vi.fn(), getSettings: () => ({ deviceId: "m1" }), onended: null as null | (() => void) };
  return { getTracks: () => [pista], getAudioTracks: () => [pista], pista } as unknown as MediaStream & { pista: typeof pista };
}

/** La pantalla de Reuniones de mentira: empieza una grabación. */
function Empezar({ stream }: { stream: MediaStream }) {
  const { comenzar } = useGrabacionActiva();
  return <button onClick={() => comenzar({ meetingId: 7, titulo: "Junta de operaciones", stream })}>Empezar</button>;
}

function Estado() {
  const motor = useMotor();
  return <output data-testid="grabando">{motor?.grabadora.grabando ? "sí" : "no"}</output>;
}

function App({ pagina }: { pagina: React.ReactNode }) {
  return (
    <GrabacionProvider>
      {pagina}
      <Estado />
    </GrabacionProvider>
  );
}

describe("la grabación vive en todo el sistema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ruta.actual = "/erp/reuniones";
    GrabadoraFalsa.todas = [];
    CanalFalso.todos = [];
    CanalFalso.enviados = [];
    RelojFalso.actual = null;
    vi.stubGlobal("MediaRecorder", GrabadoraFalsa);
    vi.stubGlobal("BroadcastChannel", CanalFalso);
    vi.stubGlobal("Worker", RelojFalso);
    vi.stubGlobal("AudioContext", undefined);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() } });
    api.subirParte.mockResolvedValue({ ok: true, parte: 1 });
    api.concluirGrabacion.mockResolvedValue({ ok: true });
    api.estadoGrabacion.mockResolvedValue({ disponible: true, existe: true, estado: "GRABANDO", notas: [], notasDesde: 0, listas: 0, pendientes: 0, duracionMs: 60_000, ultima: 3 });
    mic.listarMicrofonos.mockResolvedValue([]);
    document.title = "Clientes · NEXARA Core";
  });

  it("cambiar de módulo no la corta: el micrófono sigue abierto y aparece la barra", async () => {
    const stream = microfonoFalso();
    const usuario = userEvent.setup();
    const { rerender } = render(<App pagina={<Empezar stream={stream} />} />);
    await usuario.click(screen.getByRole("button", { name: "Empezar" }));
    await waitFor(() => expect(screen.getByTestId("grabando")).toHaveTextContent("sí"));
    // En Reuniones está el panel completo: la barra sobra.
    expect(screen.queryByRole("region", { name: /Grabación de la reunión en curso/ })).not.toBeInTheDocument();
    expect(GrabadoraFalsa.todas).toHaveLength(1);

    ruta.actual = "/erp/clientes";
    rerender(<App pagina={<p>Clientes</p>} />);

    expect(GrabadoraFalsa.todas[0].state).toBe("recording");
    expect(stream.pista.stop).not.toHaveBeenCalled();
    expect(screen.getByTestId("grabando")).toHaveTextContent("sí");
    expect(await screen.findByRole("region", { name: /Grabación de la reunión en curso/ })).toBeInTheDocument();
    expect(screen.getByText("Junta de operaciones")).toBeInTheDocument();
    // Y la pestaña lo dice aunque estés en otra.
    await waitFor(() => expect(document.title).toMatch(/^● .* · Clientes · NEXARA Core$/));
    // Nota para retomar si la página se recarga.
    expect(leerNota()).toMatchObject({ meetingId: 7, titulo: "Junta de operaciones" });
  });

  it("en una pestaña oculta el reloj del worker sigue partiendo y subiendo el audio", async () => {
    const stream = microfonoFalso();
    const usuario = userEvent.setup();
    render(<App pagina={<Empezar stream={stream} />} />);
    await usuario.click(screen.getByRole("button", { name: "Empezar" }));
    await waitFor(() => expect(RelojFalso.actual).not.toBeNull());

    const ahora = Date.now();
    const reloj = vi.spyOn(Date, "now").mockReturnValue(ahora + 21_000);
    act(() => RelojFalso.actual!.onmessage?.());
    reloj.mockRestore();

    expect(GrabadoraFalsa.todas).toHaveLength(2);
    expect(GrabadoraFalsa.todas[0].state).toBe("inactive");
    expect(GrabadoraFalsa.todas[1].state).toBe("recording");
    await waitFor(() => expect(api.subirParte).toHaveBeenCalledWith("tok", 7, 1, expect.anything(), expect.any(Blob)));
  });

  it("si el micrófono se desconecta, se reabre solo y sigue grabando", async () => {
    const stream = microfonoFalso();
    const nuevo = microfonoFalso();
    mic.elegirMicrofonoNavegador.mockResolvedValue({ stream: nuevo, dispositivo: null, sinSenal: false });
    const usuario = userEvent.setup();
    render(<App pagina={<Empezar stream={stream} />} />);
    await usuario.click(screen.getByRole("button", { name: "Empezar" }));
    await waitFor(() => expect(stream.pista.onended).toBeTruthy());

    await act(async () => stream.pista.onended?.());

    await waitFor(() => expect(GrabadoraFalsa.todas.at(-1)?.stream).toBe(nuevo));
    expect(GrabadoraFalsa.todas.at(-1)?.state).toBe("recording");
  });

  it("concluir desde la barra pide un segundo toque, sube lo último y deja el enlace a la minuta", async () => {
    const stream = microfonoFalso();
    const usuario = userEvent.setup();
    const { rerender } = render(<App pagina={<Empezar stream={stream} />} />);
    await usuario.click(screen.getByRole("button", { name: "Empezar" }));
    await waitFor(() => expect(screen.getByTestId("grabando")).toHaveTextContent("sí"));
    ruta.actual = "/erp/clientes";
    rerender(<App pagina={<p>Clientes</p>} />);

    await usuario.click(await screen.findByRole("button", { name: "Concluir" }));
    expect(api.concluirGrabacion).not.toHaveBeenCalled();
    await usuario.click(screen.getByRole("button", { name: "¿Concluir?" }));

    await waitFor(() => expect(api.concluirGrabacion).toHaveBeenCalledWith("tok", 7));
    expect(api.subirParte).toHaveBeenCalled();
    expect(await screen.findByRole("link", { name: "Ver minuta" })).toHaveAttribute("href", "/erp/reuniones?reunion=7");
    expect(stream.pista.stop).toHaveBeenCalled();
    expect(leerNota()).toBeNull();
    expect(document.title).toBe("Clientes · NEXARA Core");
  });

  it("tras recargar la página se retoma sola, donde iba", async () => {
    const stream = microfonoFalso();
    mic.elegirMicrofonoNavegador.mockResolvedValue({ stream, dispositivo: null, sinSenal: false });
    guardarNota({ meetingId: 7, titulo: "Junta de operaciones", at: Date.now() });
    render(<App pagina={<p>Clientes</p>} />);

    await waitFor(() => expect(screen.getByTestId("grabando")).toHaveTextContent("sí"), { timeout: 4_000 });
    expect(api.estadoGrabacion).toHaveBeenCalledWith("tok", 7);
    expect(GrabadoraFalsa.todas).toHaveLength(1);
  });

  it("una nota vieja no abre el micrófono sola: ofrece retomar o concluir", async () => {
    const stream = microfonoFalso();
    mic.elegirMicrofonoNavegador.mockResolvedValue({ stream, dispositivo: null, sinSenal: false });
    guardarNota({ meetingId: 7, titulo: "Junta de ayer", at: Date.now() - RETOMAR_SOLA_MS - 1_000 });
    ruta.actual = "/erp/clientes";
    const usuario = userEvent.setup();
    render(<App pagina={<p>Clientes</p>} />);

    expect(await screen.findByText("La grabación se interrumpió", {}, { timeout: 4_000 })).toBeInTheDocument();
    expect(mic.elegirMicrofonoNavegador).not.toHaveBeenCalled();
    await usuario.click(screen.getByRole("button", { name: "Retomar" }));
    await waitFor(() => expect(screen.getByTestId("grabando")).toHaveTextContent("sí"));
  });

  it("si ya se concluyó en otro lado, no hay nada que retomar", async () => {
    api.estadoGrabacion.mockResolvedValue({ disponible: true, existe: true, estado: "LISTA", notas: [], notasDesde: 0 });
    guardarNota({ meetingId: 7, titulo: "Junta", at: Date.now() });
    render(<App pagina={<p>Clientes</p>} />);
    await waitFor(() => expect(leerNota()).toBeNull(), { timeout: 4_000 });
    expect(mic.elegirMicrofonoNavegador).not.toHaveBeenCalled();
  });

  it("otra pestaña de Core la ve y la controla", async () => {
    ruta.actual = "/erp/clientes";
    guardarNota({ meetingId: 7, titulo: "Junta de operaciones", at: Date.now() });
    const usuario = userEvent.setup();
    render(<App pagina={<p>Clientes</p>} />);
    await waitFor(() => expect(CanalFalso.todos.length).toBeGreaterThan(0));

    act(() => {
      CanalFalso.todos[0].onmessage?.({ data: { tipo: "estado", meetingId: 7, titulo: "Junta de operaciones", ms: 65_000, pausado: false, concluyendo: false } });
    });

    expect(await screen.findByText(/en otra pestaña/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Pausar" }));
    expect(CanalFalso.enviados).toContainEqual({ tipo: "orden", orden: "pausar" });
    // Aunque había nota reciente, esta pestaña no abre el micrófono: ya hay quien grabe.
    await new Promise((r) => setTimeout(r, 1_600));
    expect(mic.elegirMicrofonoNavegador).not.toHaveBeenCalled();
  });

  it("la pestaña que graba obedece a las otras", async () => {
    const stream = microfonoFalso();
    const usuario = userEvent.setup();
    render(<App pagina={<Empezar stream={stream} />} />);
    await usuario.click(screen.getByRole("button", { name: "Empezar" }));
    await waitFor(() => expect(CanalFalso.todos.length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.getByTestId("grabando")).toHaveTextContent("sí"));

    act(() => {
      CanalFalso.todos.forEach((c) => c.onmessage?.({ data: { tipo: "orden", orden: "pausar" } }));
    });
    await waitFor(() => expect(GrabadoraFalsa.todas[0].state).toBe("inactive"));
    expect(CanalFalso.enviados.some((m) => m.tipo === "estado")).toBe(true);
  });
});
