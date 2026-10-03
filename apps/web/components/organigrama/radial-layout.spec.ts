import { describe, expect, it } from "vitest";
import type { OrgChartNode } from "@/lib/orgchart-layout";
import {
  type DisenoRadial,
  TARJETA,
  TARJETA_CENTRO,
  TARJETA_COMPACTA,
  UMBRAL_COMPACTO,
  calcularRadial,
  elegirCentro,
  seTocan,
  zoomQueCabe,
} from "./radial-layout";

type Persona = OrgChartNode & { department: { id: number; nombre: string } };

function persona(
  id: number,
  nombre: string,
  puesto: string,
  area: string,
  managerId: number | null,
  children: OrgChartNode[] = [],
): Persona {
  return {
    id,
    nombre,
    puesto,
    avatarUrl: null,
    managerId,
    lateralDeId: null,
    role: null,
    department: { id: area.length, nombre: area },
    children,
  };
}

/** La plantilla real de NEXARA: 17 personas, el director y una sin jefe. */
function plantilla17(): OrgChartNode[] {
  return [
    persona(1, "Christian Eduardo Del Pozo Sánchez", "Director General", "Dirección", null, [
      persona(2, "Daniela Hernández Cruz", "Encargada comercial", "Administración", 1),
      persona(3, "David Morales Zenón", "Encargado de instalación", "Operaciones", 1, [
        persona(31, "David Sánchez González", "Técnico instalador", "Ingeniería", 3),
        persona(32, "Erick Ernesto Juárez Muñoz", "Técnico instalador", "Ingeniería", 3),
        persona(33, "Isaac Rojas Romero", "Técnico instalador", "Ingeniería", 3),
        persona(34, "Israel Ramos Lima", "Técnico instalador", "Ingeniería", 3),
        persona(35, "Salvador Hernández Páramo", "Técnico instalador", "Ingeniería", 3),
      ]),
      persona(4, "José Antonio Ramírez Salazar", "Encargado de soporte", "Ingeniería", 1, [
        persona(41, "Alejandro González Bustamante", "Soporte", "Ingeniería", 4),
        persona(42, "Carolina Juárez Álvarez", "Soporte", "Ingeniería", 4),
        persona(43, "Roberto Paul Vivanco López", "Soporte", "Ingeniería", 4),
      ]),
      persona(5, "Josué Teodulo Cervantes Arellano", "Encargado de obra", "Arquitectura", 1),
      persona(6, "Luis Joel Aguilar Castillo", "Coordinador de operaciones", "Operaciones", 1, [
        persona(61, "Iván Camargo Cañete", "Ingeniería", "Ingeniería", 6),
      ]),
      persona(7, "Paulina Tlapaltotoli Álvarez", "Contadora general", "Administración", 1),
    ]),
    persona(8, "Mónica García Guzmán", "Administrativo", "Administración", null),
  ];
}

/** 40 personas: siete mandos con equipos de 8, 7, 6, 5, 3, 2 y 1, y una sin jefe. */
function plantilla40(): OrgChartNode[] {
  let seq = 100;
  const equipos = [8, 7, 6, 5, 3, 2, 1].map((cuantos, i) =>
    persona(10 + i, `Mando ${i + 1} Apellido Apellido`, "Encargado de área", `Área ${i % 4}`, 1,
      Array.from({ length: cuantos }, (_, j) =>
        persona(seq++, `Persona ${i + 1}-${j + 1} Apellido Largo`, "Técnico de campo", `Área ${i % 4}`, 10 + i),
      ),
    ),
  );
  return [
    persona(1, "Christian Eduardo Del Pozo Sánchez", "Director General", "Dirección", null, equipos),
    persona(8, "Mónica García Guzmán", "Administrativo", "Administración", null),
  ];
}

/** Lienzo de la laptop de Adam: 1536×864 menos menú y relleno del panel. */
const LIENZO = { ancho: 1214, alto: 676 };

function choques(diseno: DisenoRadial): string[] {
  const fallos: string[] = [];
  for (let i = 0; i < diseno.nodos.length; i += 1) {
    for (let j = i + 1; j < diseno.nodos.length; j += 1) {
      if (seTocan(diseno.nodos[i], diseno.nodos[j], 4)) {
        fallos.push(`${diseno.nodos[i].persona.nombre} × ${diseno.nodos[j].persona.nombre}`);
      }
    }
  }
  return fallos;
}

describe("radial-layout · quién va al centro", () => {
  it("el centro es la raíz sin jefe con más gente debajo, no la primera", () => {
    expect(elegirCentro(plantilla17())?.id).toBe(1);
    expect(elegirCentro([...plantilla17()].reverse())?.id).toBe(1);
  });

  it("si todas las raíces cuelgan de alguien que ya no está, va la que más gente tenga", () => {
    const huerfanas: OrgChartNode[] = [
      persona(2, "Sola", "Puesto", "Área", 999),
      persona(3, "Con gente", "Puesto", "Área", 999, [persona(4, "Alguien", "Puesto", "Área", 3)]),
    ];
    expect(elegirCentro(huerfanas)?.id).toBe(3);
    expect(elegirCentro([])).toBeNull();
  });
});

describe("radial-layout · la plantilla de 17", () => {
  const diseno = calcularRadial(plantilla17(), { aspecto: LIENZO.ancho / LIENZO.alto });

  it("dibuja a todos exactamente una vez, con el director en (0, 0)", () => {
    expect(diseno.nodos).toHaveLength(17);
    expect(new Set(diseno.nodos.map((n) => n.id)).size).toBe(17);
    const centro = diseno.nodos.find((n) => n.id === 1)!;
    expect(diseno.centroId).toBe(1);
    expect(centro).toMatchObject({ x: 0, y: 0, nivel: 0, enlazaCon: null, tipoEnlace: null });
    expect(centro.ancho).toBe(TARJETA_CENTRO.ancho);
  });

  it("ninguna tarjeta pisa a otra", () => {
    expect(choques(diseno)).toEqual([]);
  });

  it("los reportes directos van en el primer anillo y los equipos en el segundo", () => {
    const nivelDe = (id: number) => diseno.nodos.find((n) => n.id === id)!.nivel;
    for (const id of [2, 3, 4, 5, 6, 7]) expect(nivelDe(id)).toBe(1);
    for (const id of [31, 32, 33, 34, 35, 41, 42, 43, 61]) expect(nivelDe(id)).toBe(2);
    expect(diseno.anillos).toHaveLength(2);
  });

  it("cada equipo se abre en el sector de su jefe: sus ángulos quedan alrededor del suyo", () => {
    const angulo = (id: number) => diseno.nodos.find((n) => n.id === id)!.angulo;
    const alrededor = (jefe: number, gente: number[]) => {
      const centro = angulo(jefe);
      const desvios = gente.map((id) => {
        let d = angulo(id) - centro;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return d;
      });
      // El abanico queda centrado en el jefe: tanto a un lado como al otro.
      expect(Math.abs(desvios.reduce((a, b) => a + b, 0) / desvios.length)).toBeLessThan(0.25);
      expect(Math.max(...desvios.map(Math.abs))).toBeLessThan(Math.PI / 2);
    };
    alrededor(3, [31, 32, 33, 34, 35]);
    alrededor(4, [41, 42, 43]);
    alrededor(6, [61]);
  });

  it("el equipo más grande ocupa más sector que uno de una persona", () => {
    const angulo = (id: number) => diseno.nodos.find((n) => n.id === id)!.angulo;
    const abanico = (gente: number[]) => {
      const a = gente.map(angulo);
      return Math.max(...a) - Math.min(...a);
    };
    expect(abanico([31, 32, 33, 34, 35])).toBeGreaterThan(abanico([41, 42, 43]));
  });

  it("quien no tiene jefe se cuelga del centro con línea punteada y no se pierde", () => {
    const monica = diseno.nodos.find((n) => n.id === 8)!;
    expect(monica).toMatchObject({ nivel: 1, enlazaCon: 1, tipoEnlace: "sinJefe" });
    const enlace = diseno.enlaces.find((e) => e.a === 8)!;
    expect(enlace.tipo).toBe("sinJefe");
    expect(enlace.de).toBe(1);
  });

  it("hay un conector por persona salvo el centro, y todos parten de alguien dibujado", () => {
    expect(diseno.enlaces).toHaveLength(16);
    const ids = new Set(diseno.nodos.map((n) => n.id));
    for (const e of diseno.enlaces) {
      expect(ids.has(e.de)).toBe(true);
      expect(ids.has(e.a)).toBe(true);
      expect(e.trazo).toMatch(/^M-?[\d.]+,-?[\d.]+ /);
    }
  });

  it("cabe legible en la laptop: zoom por encima de 0.9", () => {
    expect(zoomQueCabe(diseno, LIENZO)).toBeGreaterThan(0.9);
    expect(diseno.compacto).toBe(false);
    expect(diseno.nodos.find((n) => n.id === 2)!.ancho).toBe(TARJETA.ancho);
  });

  it("es determinista: el mismo árbol da el mismo dibujo", () => {
    expect(calcularRadial(plantilla17(), { aspecto: LIENZO.ancho / LIENZO.alto })).toEqual(diseno);
  });
});

describe("radial-layout · colocación lateral", () => {
  it("el lateral va en el anillo de su ancla, unido a ella con puente punteado, sin línea del jefe", () => {
    const roots = plantilla17();
    const luis = roots[0].children.find((c) => c.id === 6)!;
    luis.lateralDeId = 4; // al lado de José Antonio
    const diseno = calcularRadial(roots, { aspecto: 1.8 });

    const nodoLuis = diseno.nodos.find((n) => n.id === 6)!;
    const nodoAntonio = diseno.nodos.find((n) => n.id === 4)!;
    expect(nodoLuis.nivel).toBe(nodoAntonio.nivel);
    expect(nodoLuis).toMatchObject({ enlazaCon: 4, tipoEnlace: "lateral" });
    expect(diseno.enlaces.filter((e) => e.a === 6)).toHaveLength(1);
    expect(diseno.enlaces.find((e) => e.a === 6)!.tipo).toBe("lateral");
    // Sigue en el dibujo con su gente debajo: Iván cuelga de él, un anillo más afuera.
    expect(diseno.nodos.find((n) => n.id === 61)).toMatchObject({
      nivel: nodoLuis.nivel + 1,
      enlazaCon: 6,
      tipoEnlace: "mando",
    });
    expect(diseno.nodos).toHaveLength(17);
    expect(choques(diseno)).toEqual([]);
    // Vecinos de verdad: comparten anillo y quedan cerca en ángulo.
    let delta = nodoLuis.angulo - nodoAntonio.angulo;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    expect(Math.abs(delta)).toBeLessThan(Math.PI / 3);
  });

  it("un lateral cuya ancla ya no está vuelve a su sitio de mando", () => {
    const roots = plantilla17();
    roots[0].children.find((c) => c.id === 6)!.lateralDeId = 999;
    const diseno = calcularRadial(roots, { aspecto: 1.8 });
    expect(diseno.nodos.find((n) => n.id === 6)).toMatchObject({ nivel: 1, enlazaCon: 1, tipoEnlace: "mando" });
  });

  it("dos personas al lado una de la otra (dato en ciclo) no se pierden", () => {
    const roots = plantilla17();
    const hijos = roots[0].children;
    hijos.find((c) => c.id === 2)!.lateralDeId = 7;
    hijos.find((c) => c.id === 7)!.lateralDeId = 2;
    const diseno = calcularRadial(roots, { aspecto: 1.8 });
    expect(diseno.nodos).toHaveLength(17);
    expect(diseno.nodos.find((n) => n.id === 2)!.tipoEnlace).toBe("mando");
    expect(diseno.nodos.find((n) => n.id === 7)!.tipoEnlace).toBe("mando");
  });
});

describe("radial-layout · escala", () => {
  it("con 40 personas pasa a tarjeta compacta, nadie se pisa y sigue cabiendo legible", () => {
    const diseno = calcularRadial(plantilla40(), { aspecto: LIENZO.ancho / LIENZO.alto });
    expect(diseno.nodos).toHaveLength(41);
    expect(diseno.compacto).toBe(true);
    expect(41).toBeGreaterThan(UMBRAL_COMPACTO);
    expect(diseno.nodos.find((n) => n.nivel === 2)!.ancho).toBe(TARJETA_COMPACTA.ancho);
    expect(choques(diseno)).toEqual([]);
    expect(zoomQueCabe(diseno, LIENZO)).toBeGreaterThan(0.65);
  });

  it("un organigrama de una sola persona es solo el centro", () => {
    const diseno = calcularRadial([persona(1, "Sola", "Directora", "Dirección", null)]);
    expect(diseno.nodos).toHaveLength(1);
    expect(diseno.enlaces).toEqual([]);
    expect(diseno.anillos).toEqual([]);
    expect(zoomQueCabe(diseno, LIENZO)).toBe(1.15);
  });

  it("sin nadie no hay dibujo", () => {
    expect(calcularRadial([])).toMatchObject({ nodos: [], enlaces: [], centroId: null });
  });

  it("un lienzo angosto pide anillos menos apaisados", () => {
    const apaisado = calcularRadial(plantilla17(), { aspecto: 2.2 });
    const cuadrado = calcularRadial(plantilla17(), { aspecto: 1.0 });
    expect(apaisado.medioAncho / apaisado.medioAlto).toBeGreaterThan(cuadrado.medioAncho / cuadrado.medioAlto);
    expect(choques(cuadrado)).toEqual([]);
  });

  it("el zoom que cabe nunca amplía por encima del tope", () => {
    expect(zoomQueCabe({ medioAncho: 100, medioAlto: 50 }, { ancho: 2000, alto: 2000 })).toBe(1.15);
    expect(zoomQueCabe({ medioAncho: 1000, medioAlto: 500 }, { ancho: 1000, alto: 1000 })).toBeCloseTo(0.48, 2);
    expect(zoomQueCabe({ medioAncho: 0, medioAlto: 0 }, LIENZO)).toBe(1);
  });
});
