import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OfflineNetworkBanner from "./OfflineNetworkBanner";
import { OFFLINE_QUEUE_STORAGE_KEY } from "@/lib/offline-queue";

const useUser = vi.hoisted(() => vi.fn());
const isCapacitorNative = vi.hoisted(() => vi.fn(() => false));
const flushOfflineQueue = vi.hoisted(() => vi.fn(async (_auth: () => string | undefined) => undefined));

vi.mock("./UserContext", () => ({ useUser }));
vi.mock("@/lib/capacitor-env", () => ({ isCapacitorNative }));
vi.mock("@/lib/offline-queue", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/offline-queue")>();
  return { ...real, flushOfflineQueue };
});

function enCola(n: number) {
  localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `${i}` }))));
}

function sinSenal() {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
}

beforeEach(() => {
  useUser.mockReturnValue({ user: { id: 1, token: "jwt-1" } });
  isCapacitorNative.mockReturnValue(false);
  flushOfflineQueue.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("banda de conexión", () => {
  it("sin señal y con cola dice los dos datos, con la cuenta en singular o plural", async () => {
    sinSenal();
    enCola(3);
    const { unmount } = render(<OfflineNetworkBanner />);
    expect(await screen.findByRole("status")).toHaveTextContent("Sin conexión · 3 operaciones pendientes de envío");
    unmount();

    enCola(1);
    render(<OfflineNetworkBanner />);
    expect(await screen.findByRole("status")).toHaveTextContent("Sin conexión · 1 operación pendiente de envío");
  });

  it("en el navegador no ofrece Reintentar: la cola no se reenvía con la sesión de otra persona", async () => {
    enCola(2);
    render(<OfflineNetworkBanner />);
    expect(await screen.findByRole("status")).toHaveTextContent("2 operaciones pendientes de envío");
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });

  it("en la app nativa, con señal, Reintentar reenvía con el token de la sesión", async () => {
    isCapacitorNative.mockReturnValue(true);
    enCola(2);
    render(<OfflineNetworkBanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(flushOfflineQueue).toHaveBeenCalledTimes(1);
    const auth = flushOfflineQueue.mock.calls[0]?.[0];
    expect(auth?.()).toBe("Bearer jwt-1");
  });

  it("sin señal no ofrece Reintentar ni en la app nativa", async () => {
    isCapacitorNative.mockReturnValue(true);
    sinSenal();
    enCola(2);
    render(<OfflineNetworkBanner />);
    expect(await screen.findByRole("status")).toHaveTextContent("Sin conexión");
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });
});
