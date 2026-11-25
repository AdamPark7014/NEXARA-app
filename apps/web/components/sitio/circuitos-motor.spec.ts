import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearCircuitos, T_ARMADO, T_NODO, T_NODO_PASO, type Caja, type Circuitos, type Medidas, type Opciones } from "./circuitos-motor";

/** Lo que el motor le pide a cada lienzo: método, argumentos y el color de trazo vigente. */
type Llamada = { lienzo: number; metodo: string; args: number[]; trazo: string };

const COLORES = ["#6ec6d9", "#2fbf9f", "#fbc223", "#c56ab6", "#f0704a"];

/** Un escenario de escritorio como el de la portada: emblema arriba, cinco nodos y el bloque de texto vetado. */
function medidas(ancho = 1440, alto = 900): Medidas {
  const cx = ancho / 2;
  const paso = Math.min(160, (ancho - 80) / 5);
  return {
    ancho,
    alto,
    emblema: { x: cx - 85, y: 107, w: 171, h: 190 },
    destinos: COLORES.map((color, i) => ({ caja: { x: cx + (i - 2) * paso - 24, y: 345, w: 48, h: 54 }, color })),
    vetos: [
      { x: cx - 380, y: 460, w: 760, h: 380 },
      { x: 0, y: alto - 18, w: ancho, h: 18 },
    ],
  };
}

/** Lienzos de mentira que anotan cada llamada (jsdom no pinta). El primero es el visible; luego la capa y la fija. */
function lienzos() {
  const llamadas: Llamada[] = [];
  const contextos = new Map<HTMLCanvasElement, unknown>();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    if (!contextos.has(this)) {
      const lienzo = contextos.size;
      const estado: Record<string, unknown> = { strokeStyle: "" };
      const degradado = { addColorStop() {} };
      contextos.set(
        this,
        new Proxy(estado, {
          get(t, prop: string) {
            if (prop in t) return t[prop];
            if (prop === "createRadialGradient" || prop === "createLinearGradient") return () => degradado;
            return (...args: number[]) => {
              llamadas.push({ lienzo, metodo: prop, args, trazo: String(t.strokeStyle) });
            };
          },
          set(t, prop: string, valor) {
            t[prop] = valor;
            return true;
          },
        }),
      );
    }
    return contextos.get(this) as CanvasRenderingContext2D;
  });
  // El motor escucha el cursor en el padre del lienzo: cada prueba tiene su propio escenario.
  const escenario = document.createElement("div");
  const visible = document.createElement("canvas");
  escenario.appendChild(visible);
  document.body.appendChild(escenario);
  return { visible, llamadas };
}

/** Motores vivos de la prueba en curso: se destruyen al terminar, pase o falle. */
const vivos: Circuitos[] = [];
const crear = (lienzo: HTMLCanvasElement, op: Opciones): Circuitos => {
  const c = crearCircuitos(lienzo, op);
  vivos.push(c);
  return c;
};

/** Polilíneas que un lienzo trazó con cierto color: cada una como lista de puntos. */
function polilineas(llamadas: Llamada[], lienzo: number, trazo?: string): [number, number][][] {
  const sal: [number, number][][] = [];
  let actual: [number, number][] | null = null;
  for (const l of llamadas) {
    if (l.lienzo !== lienzo) continue;
    if (l.metodo === "beginPath") actual = [];
    else if ((l.metodo === "moveTo" || l.metodo === "lineTo") && actual) actual.push([l.args[0], l.args[1]]);
    else if (l.metodo === "stroke" && actual && actual.length > 1) {
      if (!trazo || l.trazo === trazo) sal.push(actual);
      actual = null;
    }
  }
  return sal;
}

const dentro = (c: Caja, x: number, y: number) => x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h;

/** Puntos a lo largo de una polilínea, cada 3 px: un tramo recto también puede cruzar una zona vetada. */
function muestras(p: [number, number][]): [number, number][] {
  const sal: [number, number][] = [];
  for (let k = 1; k < p.length; k++) {
    const [ax, ay] = p[k - 1];
    const [bx, by] = p[k];
    const pasos = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
    for (let s = 0; s <= pasos; s++) sal.push([ax + ((bx - ax) * s) / pasos, ay + ((by - ay) * s) / pasos]);
  }
  return sal;
}

describe("Motor de circuitos del hero", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  });

  afterEach(() => {
    for (const c of vivos.splice(0)) c.destruir();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("sin lienzo 2D (navegador muy viejo) devuelve controles que no hacen nada", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const medir = vi.fn(() => medidas());
    const c = crear(document.createElement("canvas"), { medir, entrada: 0, quieto: false });
    expect(() => {
      c.pulsar(0);
      c.pausar(true);
      c.ajustar();
      c.visible(false);
      c.destruir();
    }).not.toThrow();
    expect(medir).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("si el escenario todavía no mide nada, no truena y traza al llegar las medidas", () => {
    const { visible, llamadas } = lienzos();
    let listo = false;
    const c = crear(visible, { medir: () => (listo ? medidas() : null), entrada: null, quieto: true });
    vi.advanceTimersByTime(100);
    expect(polilineas(llamadas, 1)).toHaveLength(0);
    listo = true;
    c.ajustar();
    vi.advanceTimersByTime(100);
    expect(polilineas(llamadas, 1).length).toBeGreaterThan(20);
    c.destruir();
  });

  describe("con movimiento reducido (dibujo quieto)", () => {
    it("pinta una sola vez y se queda sin pedir cuadros ni temporizadores", () => {
      const { visible, llamadas } = lienzos();
      const alLlegar = vi.fn();
      const c = crear(visible, { medir: () => medidas(), entrada: null, quieto: true, alLlegar });
      expect(visible.width).toBe(1440);
      expect(visible.height).toBe(900);
      vi.advanceTimersByTime(40);
      const pintadas = llamadas.filter((l) => l.lienzo === 0 && l.metodo === "drawImage").length;
      expect(pintadas).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(10_000);
      expect(llamadas.filter((l) => l.lienzo === 0 && l.metodo === "drawImage").length).toBe(1);
      expect(alLlegar).not.toHaveBeenCalled();
      // Ni el cursor ni un pulso pedido lo despiertan.
      visible.dispatchEvent(new MouseEvent("pointermove", { clientX: 300, clientY: 300, bubbles: true }));
      c.pulsar(2);
      expect(vi.getTimerCount()).toBe(0);
      c.destruir();
    });

    it("las cinco rutas ya están encendidas, cada una en su color y hasta su nodo", () => {
      const { visible, llamadas } = lienzos();
      const m = medidas();
      crear(visible, { medir: () => m, entrada: null, quieto: true }).destruir();
      m.destinos.forEach((d) => {
        const rutas = polilineas(llamadas, 2, d.color);
        expect(rutas, `ruta de ${d.color}`).toHaveLength(1);
        const fin = rutas[0][rutas[0].length - 1];
        // La ruta casi alineada con el emblema baja recta: puede quedar a menos de 2 px del centro del nodo.
        expect(Math.abs(fin[0] - (d.caja.x + d.caja.w / 2))).toBeLessThan(2);
        expect(fin[1]).toBeCloseTo(d.caja.y + 1, 5);
        // Sale del emblema, no de la nada.
        const ini = rutas[0][0];
        expect(dentro({ x: m.emblema.x, y: m.emblema.y, w: m.emblema.w, h: m.emblema.h + 4 }, ini[0], ini[1])).toBe(true);
      });
    });
  });

  describe("el trazo", () => {
    it.each([
      ["escritorio", 1440, 900],
      ["tableta", 820, 1000],
      ["teléfono", 390, 760],
    ])("en %s ninguna pista pisa el texto, la barra ni el piso del escenario", (_nombre, ancho, alto) => {
      const { visible, llamadas } = lienzos();
      const m = medidas(ancho, alto);
      crear(visible, { medir: () => m, entrada: null, quieto: true }).destruir();
      const pistas = polilineas(llamadas, 1, "#22324d");
      expect(pistas.length).toBeGreaterThan(ancho < 640 ? 8 : 20);
      const barra: Caja = { x: 0, y: 0, w: ancho, h: 56 };
      for (const p of pistas) {
        for (const [x, y] of muestras(p)) {
          for (const v of [...m.vetos, barra]) {
            expect(dentro(v, x, y), `punto ${x.toFixed(0)},${y.toFixed(0)} dentro de un veto`).toBe(false);
          }
        }
      }
    });

    it("solo usa horizontales, verticales y diagonales de 45°", () => {
      const { visible, llamadas } = lienzos();
      crear(visible, { medir: () => medidas(), entrada: null, quieto: true }).destruir();
      for (const p of polilineas(llamadas, 1, "#22324d")) {
        // El primer y el último tramo se recortan para llegar a la orilla de su almohadilla o del emblema.
        for (let k = 2; k < p.length - 1; k++) {
          const dx = Math.abs(p[k][0] - p[k - 1][0]);
          const dy = Math.abs(p[k][1] - p[k - 1][1]);
          expect(dx < 0.01 || dy < 0.01 || Math.abs(dx - dy) < 0.01).toBe(true);
        }
      }
    });

    it("con el mismo ancho sale el mismo dibujo; con otro ancho, otro", () => {
      const dibujo = (ancho: number) => {
        const { visible, llamadas } = lienzos();
        crear(visible, { medir: () => medidas(ancho), entrada: null, quieto: true }).destruir();
        const firma = JSON.stringify(polilineas(llamadas, 1, "#22324d"));
        vi.restoreAllMocks();
        return firma;
      };
      const a = dibujo(1440);
      expect(dibujo(1440)).toBe(a);
      expect(dibujo(1280)).not.toBe(a);
    });
  });

  describe("sin entrada (visita repetida)", () => {
    it("aparece con un velo corto y después solo queda el temporizador de ambiente", () => {
      const { visible, llamadas } = lienzos();
      const c = crear(visible, { medir: () => medidas(), entrada: null, quieto: false });
      vi.advanceTimersByTime(700);
      const cuadros = llamadas.filter((l) => l.lienzo === 0 && l.metodo === "drawImage").length;
      expect(cuadros).toBeGreaterThan(20);
      // Terminó el velo: ya no hay cuadro pedido, solo el reloj del siguiente pulso.
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(300);
      expect(llamadas.filter((l) => l.lienzo === 0 && l.metodo === "drawImage").length).toBe(cuadros);
      c.destruir();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("pausar, salir de la vista y destruir apagan el ambiente; reanudar lo vuelve a programar", () => {
      const { visible } = lienzos();
      const c = crear(visible, { medir: () => medidas(), entrada: null, quieto: false });
      vi.advanceTimersByTime(700);
      c.pausar(true);
      expect(vi.getTimerCount()).toBe(0);
      c.pausar(false);
      expect(vi.getTimerCount()).toBe(1);
      c.visible(false);
      expect(vi.getTimerCount()).toBe(0);
      // Fuera de la vista no se pide ningún cuadro, ni con el cursor encima.
      visible.dispatchEvent(new MouseEvent("pointermove", { clientX: 200, clientY: 200, bubbles: true }));
      expect(vi.getTimerCount()).toBe(0);
      c.visible(true);
      vi.advanceTimersByTime(50);
      expect(vi.getTimerCount()).toBe(1);
      c.destruir();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("un pulso pedido a mano llega a su nodo y avisa una sola vez", () => {
      const { visible } = lienzos();
      const alLlegar = vi.fn();
      const c = crear(visible, { medir: () => medidas(), entrada: null, quieto: false, alLlegar });
      c.pausar(true); // sin pulsos de ambiente: solo el nuestro
      vi.advanceTimersByTime(700);
      c.pulsar(3);
      vi.advanceTimersByTime(900);
      expect(alLlegar).toHaveBeenCalledTimes(1);
      expect(alLlegar).toHaveBeenCalledWith(3);
      // Pasado el pulso, el lienzo vuelve a quedar en reposo.
      vi.advanceTimersByTime(600);
      expect(vi.getTimerCount()).toBe(0);
      c.destruir();
    });
  });

  describe("con la entrada", () => {
    it("cada servicio recibe su pulso justo cuando el CSS enciende su nodo, de izquierda a derecha", () => {
      const { visible } = lienzos();
      const llegadas: { nodo: number; t: number }[] = [];
      const c = crear(visible, {
        medir: () => medidas(),
        entrada: 0,
        quieto: false,
        alLlegar: (nodo) => llegadas.push({ nodo, t: performance.now() / 1000 }),
      });
      c.pausar(true);
      vi.advanceTimersByTime(2600);
      expect(llegadas.map((l) => l.nodo)).toEqual([0, 1, 2, 3, 4]);
      llegadas.forEach((l, k) => {
        const esperado = T_NODO + k * T_NODO_PASO;
        expect(l.t).toBeGreaterThanOrEqual(esperado - 0.001);
        expect(l.t).toBeLessThan(esperado + 0.04); // a lo más dos cuadros después
      });
      // Terminada la entrada y pasados los pulsos, reposo total.
      vi.advanceTimersByTime(1500);
      expect(vi.getTimerCount()).toBe(0);
      c.destruir();
    });

    it("durante la entrada no acepta pulsos a mano (los nodos aún no existen para la persona)", () => {
      const { visible } = lienzos();
      const alLlegar = vi.fn();
      const c = crear(visible, { medir: () => medidas(), entrada: 0, quieto: false, alLlegar });
      c.pausar(true);
      vi.advanceTimersByTime(300);
      c.pulsar(4);
      vi.advanceTimersByTime(900);
      expect(alLlegar).not.toHaveBeenCalled();
      c.destruir();
    });

    it("si JavaScript llega tarde (la entrada en CSS ya va avanzada) no la repite desde cero", () => {
      const { visible } = lienzos();
      const llegadas: number[] = [];
      const c = crear(visible, {
        medir: () => medidas(),
        entrada: 3,
        quieto: false,
        alLlegar: (nodo) => llegadas.push(nodo),
      });
      c.pausar(true);
      vi.advanceTimersByTime(1200);
      // Llega ya armado: sin pulsos de entrada y, pasado el velo, en reposo.
      expect(llegadas).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
      c.destruir();
    });
  });

  describe("tiempos compartidos con el CSS de la entrada", () => {
    const css = readFileSync(join(__dirname, "ensamble.module.css"), "utf8");

    it("los nodos se encienden en el CSS con el mismo arranque y el mismo paso que usa el motor", () => {
      const regla = `calc(${T_NODO}s + var(--i) * ${T_NODO_PASO}s)`;
      expect(css.split(regla).length - 1).toBe(2); // el hexágono y su icono
    });

    it("el emblema se da por armado mientras el CSS funde las piezas en el logotipo sólido", () => {
      const m = /animation:\s*solido\s+([\d.]+)s\s+[a-z-]+\s+([\d.]+)s/.exec(css);
      expect(m).not.toBeNull();
      const inicio = Number(m![2]);
      const fin = inicio + Number(m![1]);
      expect(T_ARMADO).toBeGreaterThanOrEqual(inicio);
      expect(T_ARMADO).toBeLessThanOrEqual(fin);
    });

    it("el reloj de la entrada dura los 4 s por los que `Escenario` lo reconoce", () => {
      expect(css).toMatch(/animation:\s*reloj\s+4s\s+linear\s+both/);
      const escenario = readFileSync(join(__dirname, "Escenario.tsx"), "utf8");
      expect(escenario).toMatch(/duration\s*===\s*4000/);
    });
  });
});
