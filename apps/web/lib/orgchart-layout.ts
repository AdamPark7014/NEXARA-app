export type OrgChartNode = { id: number; nombre: string; puesto?: string | null; avatarUrl?: string | null; managerId?: number | null; role?: { id: number; nombre: string } | null; department?: { id: number; nombre: string } | null; children: OrgChartNode[] };

export function flattenOrgNodes(nodes: OrgChartNode[]): OrgChartNode[] {
  return nodes.reduce((acc, node) => {
    acc.push(node);
    if (node.children && node.children.length > 0) {
      acc.push(...flattenOrgNodes(node.children));
    }
    return acc;
  }, [] as OrgChartNode[]);
}

export function orgNodeSubtitle(node: Pick<OrgChartNode, 'puesto' | 'role'>): string {
  return node.puesto?.trim() || '';
}

export function maxOrgDepth(nodes: OrgChartNode[], depth = 0): number {
  return nodes.reduce((max, node) => {
    const currentDepth = depth + 1;
    if (node.children && node.children.length > 0) {
      return Math.max(max, maxOrgDepth(node.children, currentDepth));
    }
    return Math.max(max, currentDepth);
  }, 0);
}

export function countWithManager(nodes: OrgChartNode[]): number {
  return flattenOrgNodes(nodes).filter((node) => node.managerId != null).length;
}