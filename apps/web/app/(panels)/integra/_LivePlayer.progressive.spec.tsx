import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IntegraLivePlayer, type HdOffer } from "./_LivePlayer";

/**
 * Comprobación de estructura del relevo de calidad.
 *
 * La lógica de decisión ya está probada en `_quality.spec.ts`; lo que aquí se
 * fija es lo que esa lógica significa en el DOM, que es donde se rompería sin
 * que nadie lo viera: **que el reproductor del secundario siga montado mientras
 * el principal negocia**. Si alguien "optimiza" eso desmontándolo para ahorrar
 * una sesión, el operador vuelve a ver el hueco negro al abrir una cámara y las
 * pruebas de arriba seguirían todas en verde.
 *
 * En jsdom el `<video-stream>` de go2rtc no llega a cargar —es un módulo
 * remoto—, así que no se comprueba la imagen: se comprueba el andamiaje.
 */

const SUB = "http://go2rtc.test/api/stream.m3u8?src=cam_9_101";
const HD = "http://go2rtc.test/api/stream.m3u8?src=cam_9_101_hd";

const sinHd: HdOffer = { src: null, pidiendo: false, motivo: "codec", detalle: "el principal va en H.265" };
const conHd: HdOffer = { src: HD, pidiendo: false, motivo: null, detalle: null };

function capas(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-flujo], [data-encima]"));
}

describe("reproductor con mejora progresiva · andamiaje", () => {
  it("sin alta calidad hay una sola capa, la del secundario", () => {
    render(<IntegraLivePlayer src={SUB} mode="mse" hd={sinHd} />);
    const layers = capas();
    expect(layers).toHaveLength(1);
    expect(layers[0].dataset.flujo).toBe("1");
    expect(layers[0].dataset.oculta).toBeUndefined();
  });

  it("con alta calidad ofrecida se montan las dos, y la nueva va oculta", () => {
    render(<IntegraLivePlayer src={SUB} mode="mse" hd={conHd} />);
    const layers = capas();
    expect(layers).toHaveLength(2);
    // El secundario sigue en pie y sigue siendo el que da altura.
    expect(layers[0].dataset.flujo).toBe("1");
    expect(layers[0].dataset.oculta).toBeUndefined();
    // El principal negocia por detrás, invisible, hasta que dé imagen.
    expect(layers[1].dataset.encima).toBe("1");
    expect(layers[1].dataset.oculta).toBe("1");
  });

  it("el muro no cambia: sin oferta de calidad no aparece ninguna pila", () => {
    render(<IntegraLivePlayer src={SUB} mode="auto" compact />);
    expect(capas()).toHaveLength(0);
    // Y el cuadro sigue siendo el de siempre.
    expect(document.querySelector('[data-mode="mse"]')).not.toBeNull();
  });

  it("sin fuente no se monta nada de alta calidad", () => {
    render(<IntegraLivePlayer src={null} mode="mse" hd={sinHd} />);
    expect(capas()).toHaveLength(1);
    expect(screen.getByText("Selecciona una cámara")).toBeInTheDocument();
  });
});
