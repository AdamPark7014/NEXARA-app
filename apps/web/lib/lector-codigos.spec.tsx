import { render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ATRIBUTO_CAMPO_LECTOR,
  crearDetectorDeEscaneo,
  useLectorDeCodigos,
} from "./lector-codigos";

/**
 * Lector USB: una ráfaga de teclas + Enter es un escaneo; lo mismo tecleado por una
 * persona, no. Y con el foco en un campo normal, el lector no se mete.
 */

/** Teclea `texto` con `intervalo` ms entre teclas y devuelve si el Enter final se canceló. */
function teclear(
  texto: string,
  intervalo: number,
  opciones: { destino?: EventTarget; terminador?: string | null; antesDelTerminador?: number } = {},
) {
  const destino = opciones.destino ?? document.body;
  const pulsar = (key: string) => {
    const evento = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    destino.dispatchEvent(evento);
    return evento;
  };
  for (const letra of texto) {
    pulsar(letra);
    vi.advanceTimersByTime(intervalo);
  }
  if (opciones.terminador === null) return null;
  if (opciones.antesDelTerminador) vi.advanceTimersByTime(opciones.antesDelTerminador);
  return pulsar(opciones.terminador ?? "Enter");
}

describe("crearDetectorDeEscaneo", () => {
  it("ráfaga rápida + Enter es un escaneo", () => {
    const d = crearDetectorDeEscaneo();
    let t = 1000;
    for (const letra of "7501031311309") expect(d.tecla({ key: letra }, (t += 8))).toBeNull();
    expect(d.tecla({ key: "Enter" }, t + 8)).toBe("7501031311309");
  });

  it("lo mismo tecleado a mano no lo es", () => {
    const d = crearDetectorDeEscaneo();
    let t = 1000;
    for (const letra of "7501031311309") d.tecla({ key: letra }, (t += 140));
    expect(d.tecla({ key: "Enter" }, t + 140)).toBeNull();
  });

  it("justo en el límite sí; un milisegundo después ya no", () => {
    const enLimite = crearDetectorDeEscaneo({ maxIntervaloMs: 40 });
    enLimite.tecla({ key: "A" }, 0);
    enLimite.tecla({ key: "B" }, 40);
    enLimite.tecla({ key: "C" }, 80);
    expect(enLimite.tecla({ key: "Enter" }, 120)).toBe("ABC");

    const pasado = crearDetectorDeEscaneo({ maxIntervaloMs: 40 });
    pasado.tecla({ key: "A" }, 0);
    pasado.tecla({ key: "B" }, 40);
    pasado.tecla({ key: "C" }, 80);
    expect(pasado.tecla({ key: "Enter" }, 121)).toBeNull();
  });

  it("lo que se tecleó antes de la ráfaga no entra en el código", () => {
    const d = crearDetectorDeEscaneo();
    d.tecla({ key: "x" }, 0);
    d.tecla({ key: "y" }, 300);
    let t = 1000;
    for (const letra of "MUL-12345") d.tecla({ key: letra }, (t += 10));
    expect(d.tecla({ key: "Enter" }, t + 10)).toBe("MUL-12345");
  });

  it("una ráfaga demasiado corta no es un código", () => {
    const d = crearDetectorDeEscaneo({ largoMinimo: 3 });
    d.tecla({ key: "A" }, 0);
    d.tecla({ key: "B" }, 5);
    expect(d.tecla({ key: "Enter" }, 10)).toBeNull();
  });

  it("Shift en medio (mayúsculas del lector) ni suma ni corta", () => {
    const d = crearDetectorDeEscaneo();
    d.tecla({ key: "Shift" }, 0);
    d.tecla({ key: "M" }, 5);
    d.tecla({ key: "Shift" }, 10);
    d.tecla({ key: "U" }, 15);
    d.tecla({ key: "L" }, 20);
    expect(d.tecla({ key: "Enter" }, 25)).toBe("MUL");
  });

  it("un atajo con Ctrl corta la ráfaga", () => {
    const d = crearDetectorDeEscaneo();
    d.tecla({ key: "A" }, 0);
    d.tecla({ key: "B" }, 5);
    d.tecla({ key: "v", ctrlKey: true }, 10);
    d.tecla({ key: "C" }, 15);
    expect(d.tecla({ key: "Enter" }, 20)).toBeNull();
  });

  it("Tab también cierra; y tras un escaneo empieza de cero", () => {
    const d = crearDetectorDeEscaneo();
    d.tecla({ key: "1" }, 0);
    d.tecla({ key: "2" }, 5);
    d.tecla({ key: "3" }, 10);
    expect(d.tecla({ key: "Tab" }, 15)).toBe("123");
    expect(d.tecla({ key: "Enter" }, 20)).toBeNull();
  });
});

describe("useLectorDeCodigos", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sin ningún campo enfocado, la ráfaga dispara el escaneo y se come el Enter", () => {
    const onEscaneo = vi.fn();
    renderHook(() => useLectorDeCodigos({ onEscaneo }));

    const enter = teclear("036000291452", 10);

    expect(onEscaneo).toHaveBeenCalledTimes(1);
    expect(onEscaneo).toHaveBeenCalledWith("036000291452", { enCampo: false });
    // Si no se cancela, ese Enter pulsaría el botón que tuviera el foco.
    expect(enter?.defaultPrevented).toBe(true);
  });

  it("tecleado despacio no dispara nada ni cancela el Enter", () => {
    const onEscaneo = vi.fn();
    renderHook(() => useLectorDeCodigos({ onEscaneo }));

    const enter = teclear("036000291452", 120);

    expect(onEscaneo).not.toHaveBeenCalled();
    expect(enter?.defaultPrevented).toBe(false);
  });

  it("si el Enter llega tarde tampoco es un lector", () => {
    const onEscaneo = vi.fn();
    renderHook(() => useLectorDeCodigos({ onEscaneo }));
    teclear("036000291452", 10, { antesDelTerminador: 500 });
    expect(onEscaneo).not.toHaveBeenCalled();
  });

  it("no secuestra un campo normal: ahí ni escanea ni cancela el Enter", () => {
    const onEscaneo = vi.fn();
    renderHook(() => useLectorDeCodigos({ onEscaneo }));
    const { getByLabelText } = render(
      <form>
        <input aria-label="Notas" />
        <textarea aria-label="Comentario" />
      </form>,
    );

    for (const etiqueta of ["Notas", "Comentario"]) {
      const enter = teclear("036000291452", 10, { destino: getByLabelText(etiqueta) });
      expect(enter?.defaultPrevented).toBe(false);
    }
    expect(onEscaneo).not.toHaveBeenCalled();
  });

  it("en el campo «Escanear» sí toma la ráfaga, y lo tecleado a mano sigue su camino", () => {
    const onEscaneo = vi.fn();
    renderHook(() => useLectorDeCodigos({ onEscaneo }));
    const { getByLabelText } = render(
      <input aria-label="Código de barras" {...{ [ATRIBUTO_CAMPO_LECTOR]: "" }} />,
    );
    const campo = getByLabelText("Código de barras");

    const enterLector = teclear("MUL-12345", 10, { destino: campo });
    expect(onEscaneo).toHaveBeenCalledWith("MUL-12345", { enCampo: true });
    expect(enterLector?.defaultPrevented).toBe(true);

    vi.advanceTimersByTime(2000);
    const enterMano = teclear("MUL-12345", 150, { destino: campo });
    expect(onEscaneo).toHaveBeenCalledTimes(1);
    // El Enter a mano no se cancela: lo recoge el formulario del campo.
    expect(enterMano?.defaultPrevented).toBe(false);
  });

  it("una casilla o un botón enfocados no bloquean al lector", () => {
    const onEscaneo = vi.fn();
    renderHook(() => useLectorDeCodigos({ onEscaneo }));
    const { getByLabelText, getByText } = render(
      <div>
        <input type="checkbox" aria-label="Ver retiradas" />
        <button type="button">Imprimir</button>
      </div>,
    );

    teclear("ABC123", 10, { destino: getByLabelText("Ver retiradas") });
    vi.advanceTimersByTime(1000);
    const enter = teclear("XYZ789", 10, { destino: getByText("Imprimir") });

    expect(onEscaneo.mock.calls.map((c) => c[0])).toEqual(["ABC123", "XYZ789"]);
    expect(enter?.defaultPrevented).toBe(true);
  });

  it("apagado no escucha; al encenderse vuelve a escuchar", () => {
    const onEscaneo = vi.fn();
    const { rerender } = renderHook(({ activo }) => useLectorDeCodigos({ onEscaneo, activo }), {
      initialProps: { activo: false },
    });
    teclear("036000291452", 10);
    expect(onEscaneo).not.toHaveBeenCalled();

    rerender({ activo: true });
    vi.advanceTimersByTime(1000);
    teclear("036000291452", 10);
    expect(onEscaneo).toHaveBeenCalledTimes(1);
  });

  it("un repintado a media ráfaga no pierde el código", () => {
    const onEscaneo = vi.fn();
    // Arreglo y callback nuevos en cada render, como pasa en un componente real.
    const { rerender } = renderHook(() =>
      useLectorDeCodigos({ onEscaneo: (c, o) => onEscaneo(c, o), terminadores: ["Enter"] }),
    );
    teclear("0360002", 10, { terminador: null });
    rerender();
    teclear("91452", 10);
    expect(onEscaneo).toHaveBeenCalledWith("036000291452", { enCampo: false });
  });

  it("al desmontar deja de escuchar", () => {
    const onEscaneo = vi.fn();
    const { unmount } = renderHook(() => useLectorDeCodigos({ onEscaneo }));
    unmount();
    teclear("036000291452", 10);
    expect(onEscaneo).not.toHaveBeenCalled();
  });

  it("usa siempre el callback más reciente", () => {
    const primero = vi.fn();
    const segundo = vi.fn();
    const { rerender } = renderHook(({ cb }) => useLectorDeCodigos({ onEscaneo: cb }), {
      initialProps: { cb: primero },
    });
    rerender({ cb: segundo });
    teclear("036000291452", 10);
    expect(primero).not.toHaveBeenCalled();
    expect(segundo).toHaveBeenCalledTimes(1);
  });
});
