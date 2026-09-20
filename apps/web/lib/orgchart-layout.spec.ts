import { describe, expect, it } from 'vitest';
import {
  type OrgChartNode,
  flattenOrgNodes,
  orgNodeSubtitle,
  maxOrgDepth,
  countWithManager,
  countWithoutManager,
  countOrphanRoots,
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
