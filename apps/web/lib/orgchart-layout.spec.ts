import { describe, expect, it } from 'vitest';
import {
  type OrgChartNode,
  flattenOrgNodes,
  orgNodeSubtitle,
  maxOrgDepth,
  countWithManager,
  countWithoutManager,
  countOrphanRoots,
  anchoNatural,
  contarSubordinados,
  convieneCompacto,
  esLateral,
  hijosDeMando,
  lateralesDe,
  lateralesHuerfanos,
  raicesDibujadas,
} from './orgchart-layout';

function node(
  partial: Omit<OrgChartNode, 'nombre' | 'children'> & {
    nombre?: string;
    children?: OrgChartNode[];
  },
): OrgChartNode {
  return {
    nombre: partial.nombre ?? `N${partial.id}`,
    children: partial.children ?? [],
    ...partial,
  };
}

describe('orgchart-layout', () => {
  const tree: OrgChartNode[] = [
    node({
      id: 1,
      nombre: 'A',
      managerId: null,
      puesto: 'Director General',
      role: { id: 10, nombre: 'Director' },
      children: [
        node({
          id: 2,
          nombre: 'B',
          managerId: 1,
          puesto: 'Encargado de soporte',
          role: { id: 20, nombre: 'Ingeniero' },
          children: [
            node({
              id: 3,
              nombre: 'C',
              managerId: 2,
              puesto: null,
              role: { id: 30, nombre: 'Staff' },
            }),
          ],
        }),
        node({
          id: 4,
          nombre: 'D',
          managerId: 1,
          puesto: 'Encargado de Obra',
          role: { id: 40, nombre: 'Constructor' },
        }),
      ],
    }),
  ];

  it('aplana el árbol en DFS (A, B, C, D)', () => {
    expect(flattenOrgNodes(tree).map((n) => n.id)).toEqual([1, 2, 3, 4]);
  });

  it('usa puesto como subtítulo, nunca role.nombre', () => {
    const b = flattenOrgNodes(tree).find((n) => n.id === 2)!;
    expect(orgNodeSubtitle(b)).toBe('Encargado de soporte');
    expect(orgNodeSubtitle(b)).not.toBe(b.role!.nombre);
  });

  it('sin puesto devuelve vacío (no cae al rol)', () => {
    const c = flattenOrgNodes(tree).find((n) => n.id === 3)!;
    expect(orgNodeSubtitle(c)).toBe('');
  });

  it('calcula profundidad máxima', () => {
    expect(maxOrgDepth(tree)).toBe(3);
  });

  it('cuenta nodos con manager', () => {
    expect(countWithManager(tree)).toBe(3);
  });

  it('cuenta nodos sin manager por managerId, no por raíces del bosque', () => {
    expect(countWithoutManager(tree)).toBe(1);
    const forest = [
      ...tree,
      node({ id: 9, nombre: 'Huérfano', managerId: 999, children: [] }),
    ];
    expect(countWithoutManager(forest)).toBe(1);
    expect(countOrphanRoots(forest)).toBe(1);
    expect(countWithManager(forest)).toBe(4);
  });
});

/**
 * Colocación lateral. La regla que estas pruebas sostienen, y que ninguna
 * «mejora» del dibujo debería poder romper sin romperlas a ellas primero:
 *
 *   > Estar al lado de alguien no es colgar de alguien.
 *
 * Importa porque en NEXARA «tener gente a cargo» abre puertas: permiso de crear
 * y editar clientes, alcance de la pizarra, quién cancela una actividad ajena,
 * quién aprueba una comida a destiempo. Todo eso se cuenta con `managerId`.
 */
describe('orgchart-layout · colocación lateral', () => {
  const ANTONIO = 10;
  const LUIS = 11;
  const SOPORTE = 12;

  /** Antonio con Soporte debajo; Luis cuelga de Christian pero se dibuja al costado de Antonio. */
  const conLateral: OrgChartNode[] = [
    node({
      id: 1,
      nombre: 'Christian',
      managerId: null,
      children: [
        node({
          id: ANTONIO,
          nombre: 'Antonio',
          managerId: 1,
          children: [node({ id: SOPORTE, nombre: 'Soporte', managerId: ANTONIO })],
        }),
        node({ id: LUIS, nombre: 'Luis', managerId: 1, lateralDeId: ANTONIO }),
      ],
    }),
  ];

  it('un lateral NO se cuenta como subordinado de quien acompaña', () => {
    const antonio = flattenOrgNodes(conLateral).find((n) => n.id === ANTONIO)!;
    expect(contarSubordinados(antonio)).toBe(1); // Soporte, y solo Soporte
    expect(hijosDeMando(antonio).map((h) => h.id)).toEqual([SOPORTE]);
    expect(hijosDeMando(antonio).map((h) => h.id)).not.toContain(LUIS);
  });

  it('pero sí sigue contando para su jefe de verdad: el dibujo no cambia el mando', () => {
    const christian = conLateral[0];
    expect(contarSubordinados(christian)).toBe(3); // Antonio, Soporte y Luis
    const luis = flattenOrgNodes(conLateral).find((n) => n.id === LUIS)!;
    expect(luis.managerId).toBe(1);
  });

  it('sale de la fila de hijos de su jefe, para que no le baje una línea de mando', () => {
    const christian = conLateral[0];
    expect(hijosDeMando(christian).map((h) => h.id)).toEqual([ANTONIO]);
    // Pero sigue en el árbol: el censo no pierde a nadie por moverlo de sitio.
    expect(flattenOrgNodes(conLateral)).toHaveLength(4);
    expect(countWithManager(conLateral)).toBe(3);
  });

  it('sabe a quién tiene al costado, y distingue lateral de subordinado', () => {
    const todos = flattenOrgNodes(conLateral);
    expect(lateralesDe(ANTONIO, todos).map((n) => n.id)).toEqual([LUIS]);
    expect(lateralesDe(LUIS, todos)).toEqual([]);
    expect(esLateral(todos.find((n) => n.id === LUIS)!)).toBe(true);
    expect(esLateral(todos.find((n) => n.id === SOPORTE)!)).toBe(false);
  });

  it('un lateral con raíz propia no encabeza el dibujo: va al costado de su ancla', () => {
    const bosque: OrgChartNode[] = [
      node({ id: ANTONIO, nombre: 'Antonio', managerId: null }),
      node({ id: LUIS, nombre: 'Luis', managerId: null, lateralDeId: ANTONIO }),
    ];
    expect(raicesDibujadas(bosque).map((n) => n.id)).toEqual([ANTONIO]);
  });

  it('si su ancla ya no está en el mapa, no se pierde: vuelve a su sitio', () => {
    const bosque: OrgChartNode[] = [
      node({ id: ANTONIO, nombre: 'Antonio', managerId: null }),
      node({ id: LUIS, nombre: 'Luis', managerId: null, lateralDeId: 999 }),
    ];
    expect(raicesDibujadas(bosque).map((n) => n.id)).toEqual([ANTONIO, LUIS]);
    expect(lateralesHuerfanos(bosque).map((n) => n.id)).toEqual([LUIS]);
  });
});

/**
 * La forma del árbol. Con 16 personas, el ajuste automático tocaba su suelo de
 * legibilidad y aun así entregaba un árbol más ancho que el hueco: no hay zoom
 * que arregle 3,000px dentro de 1,000. Lo que cambia es la forma.
 */
describe('orgchart-layout · extendido o compacto', () => {
  /** Un jefe, tres mandos con cuatro técnicos cada uno, y tres sueltos: 16. */
  const equipoDe16: OrgChartNode[] = [
    node({
      id: 1,
      nombre: 'Christian',
      managerId: null,
      children: [
        ...[2, 3, 4].map((id) =>
          node({
            id,
            nombre: `Mando ${id}`,
            managerId: 1,
            children: Array.from({ length: 4 }, (_, i) =>
              node({ id: id * 10 + i, nombre: `Tecnico ${id}-${i}`, managerId: id }),
            ),
          }),
        ),
        node({ id: 5, nombre: 'Suelto 5', managerId: 1 }),
        node({ id: 6, nombre: 'Suelto 6', managerId: 1 }),
        node({ id: 7, nombre: 'Suelto 7', managerId: 1 }),
      ],
    }),
  ];

  it('apilar a la gente sin nadie debajo encoge el árbol a menos de la mitad', () => {
    const extendido = anchoNatural(equipoDe16, false);
    const compacto = anchoNatural(equipoDe16, true);
    expect(extendido).toBeGreaterThan(1500);
    expect(compacto).toBeLessThan(extendido / 2);
  });

  it('en un hueco de pantalla normal, con 16 personas conviene apilar', () => {
    expect(convieneCompacto(equipoDe16, 976, 0.45)).toBe(true);
    // Y ya apilado cabe legible: no hace falta bajar del suelo de legibilidad.
    expect(anchoNatural(equipoDe16, true) * 0.45).toBeLessThan(976);
  });

  it('un organigrama pequeño se queda extendido', () => {
    const tres: OrgChartNode[] = [
      node({
        id: 1,
        nombre: 'Jefa',
        managerId: null,
        children: [node({ id: 2, nombre: 'A', managerId: 1 }), node({ id: 3, nombre: 'B', managerId: 1 })],
      }),
    ];
    expect(convieneCompacto(tres, 976, 0.45)).toBe(false);
  });

  it('sin hueco medido todavía, no se decide nada', () => {
    expect(convieneCompacto(equipoDe16, 0, 0.45)).toBe(false);
  });
});
