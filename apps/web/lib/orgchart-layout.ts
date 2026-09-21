export type OrgChartNode = {
  id: number;
  nombre: string;
  puesto?: string | null;
  avatarUrl?: string | null;
  managerId?: number | null;
  /**
   * Colocación **al costado** de esa persona: misma altura, línea punteada, sin mando.
   * Es solo dibujo — no sale de aquí. `managerId` sigue siendo la única jerarquía, y
   * los conteos de esta librería lo respetan (ver `contarSubordinados`).
   */
  lateralDeId?: number | null;
  role?: { id: number; nombre: string } | null;
  department?: { id: number; nombre: string } | null;
  children: OrgChartNode[];
};

/** Ancho de la tarjeta de persona; la maquetación del árbol depende de él. */
export const ANCHO_TARJETA = 168;
/** Separación entre hermanos. */
export const HUECO = 16;
/** Sangría de una columna apilada respecto de su jefe, en modo compacto. */
export const SANGRIA = 24;
/** Hermanos por renglón antes de envolver: más de esto estira el árbol a lo ancho. */
export const MAX_POR_FILA = 4;

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

/** Personas sin jefe asignado (`managerId` null), no el conteo de raíces del bosque. */
export function countWithoutManager(nodes: OrgChartNode[]): number {
  return flattenOrgNodes(nodes).filter((node) => node.managerId == null).length;
}

/** Raíces de visualización cuyo managerId apunta a alguien fuera del mapa (inactivo / otro tenant). */
export function countOrphanRoots(nodes: OrgChartNode[]): number {
  return nodes.filter((node) => node.managerId != null).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Colocación lateral
//
// Un lateral se dibuja al costado de su ancla, a su misma altura, con línea
// punteada y sin flecha de mando. Se saca de la fila de hijos de su jefe para
// que no le baje una línea de mando encima, pero **sigue estando en el árbol**:
// `flattenOrgNodes` lo ve, los conteos lo cuentan y su `managerId` no se toca.
// ─────────────────────────────────────────────────────────────────────────────

export function esLateral(node: Pick<OrgChartNode, 'lateralDeId'>): boolean {
  return node.lateralDeId != null;
}

/**
 * Hijos que sí son línea de mando: los que cuelgan de este nodo y no se fueron a
 * dibujar al costado de alguien. Es lo que debe pintarse bajo la tarjeta.
 */
export function hijosDeMando(node: OrgChartNode): OrgChartNode[] {
  return (node.children ?? []).filter((child) => !esLateral(child));
}

/** Quién se dibuja al costado de `anclaId`, en el orden en que llegó del servidor. */
export function lateralesDe(anclaId: number, todos: OrgChartNode[]): OrgChartNode[] {
  return todos.filter((node) => node.lateralDeId === anclaId);
}

/**
 * Personas a cargo de alguien: **lo que dice `managerId`, no lo que dice el dibujo**.
 *
 * Cuenta el árbol de mando completo, incluida la gente que se haya movido al
 * costado de otro: mover una tarjeta cambia dónde se pinta, no de quién depende.
 * Y por eso mismo un lateral **nunca** suma a la cuenta de la persona a la que
 * acompaña: no cuelga de ella. Es la misma frontera que sostiene la API
 * (`organigrama-lateral.ts`), y aquí importa igual, porque en NEXARA «tener gente
 * a cargo» abre permisos. `orgchart-layout.spec` lo fija.
 */
export function contarSubordinados(node: OrgChartNode): number {
  return (node.children ?? []).reduce((total, hijo) => total + 1 + contarSubordinados(hijo), 0);
}

/**
 * Laterales que apuntan a alguien que ya no está en el mapa (dado de baja, otra
 * empresa). Se dibujan en su sitio normal del árbol en vez de perderse.
 */
export function lateralesHuerfanos(roots: OrgChartNode[]): OrgChartNode[] {
  const todos = flattenOrgNodes(roots);
  const ids = new Set(todos.map((n) => n.id));
  return todos.filter((n) => n.lateralDeId != null && !ids.has(n.lateralDeId));
}

// ─────────────────────────────────────────────────────────────────────────────
// ¿Cabe el árbol, o hay que apilarlo?
//
// El ajuste automático encogía hasta un suelo de legibilidad y, cuando el árbol
// no cabía ni así, devolvía un zoom que **seguía saliéndose de la caja**: el
// botón decía «ajustar» y el organigrama salía cortado igual. Con 16 personas el
// árbol mide unos 3,000px y el hueco ronda los 1,000: no hay zoom legible que lo
// arregle. La salida no es encoger más, es **cambiar la forma**.
//
// En compacto, un jefe cuyos hijos son todos hojas los apila en una columna con
// sangría en vez de extenderlos en fila. Cuatro hojas pasan de ~736px a ~192px.
// ─────────────────────────────────────────────────────────────────────────────

function enTrozos<T>(lista: T[], tamano: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) out.push(lista.slice(i, i + tamano));
  return out;
}

/** Todos los hijos de mando de este nodo son hojas (nadie cuelga de ellos). */
export function soloHojas(node: OrgChartNode): boolean {
  const hijos = hijosDeMando(node);
  return hijos.length > 0 && hijos.every((h) => hijosDeMando(h).length === 0);
}

/**
 * Ancho que ocuparía una rama, en píxeles y sin escalar. Es una estimación de la
 * maquetación real (misma tarjeta, mismo hueco, mismo envolver a `MAX_POR_FILA`),
 * suficiente para decidir la forma antes de pintar nada — y así no depender de
 * medir el DOM, que es lo que metía al ajuste en un bucle.
 */
export function anchoDeRama(
  node: OrgChartNode,
  compacto: boolean,
  todos: OrgChartNode[],
  vistos: Set<number> = new Set(),
): number {
  if (vistos.has(node.id)) return ANCHO_TARJETA; // dato en ciclo: no se cuelga midiendo
  const propios = new Set(vistos).add(node.id);

  const propio = anchoConLaterales(node, compacto, todos, propios);
  const hijos = hijosDeMando(node);
  if (hijos.length === 0) return propio;

  if (compacto && soloHojas(node)) {
    // Apilados en una columna bajo el jefe, con sangría.
    const masAncho = Math.max(...hijos.map((h) => anchoConLaterales(h, compacto, todos, propios)));
    return Math.max(propio, SANGRIA + masAncho);
  }

  const anchos = hijos.map((h) => anchoDeRama(h, compacto, todos, propios));
  const porFila = Math.min(hijos.length, MAX_POR_FILA);
  const filas = enTrozos(anchos, porFila).map(
    (fila) => fila.reduce((a, b) => a + b, 0) + HUECO * (fila.length - 1),
  );
  return Math.max(propio, ...filas);
}

/** La tarjeta más lo que lleve pegado al costado. */
function anchoConLaterales(
  node: OrgChartNode,
  compacto: boolean,
  todos: OrgChartNode[],
  vistos: Set<number>,
): number {
  const laterales = lateralesDe(node.id, todos).filter((lat) => !vistos.has(lat.id));
  if (laterales.length === 0) return ANCHO_TARJETA;
  return (
    ANCHO_TARJETA +
    laterales.reduce((total, lat) => total + HUECO + anchoDeRama(lat, compacto, todos, vistos), 0)
  );
}

/** Raíces que de verdad encabezan el dibujo: las que no se fueron al costado de alguien. */
export function raicesDibujadas(roots: OrgChartNode[]): OrgChartNode[] {
  const ids = new Set(flattenOrgNodes(roots).map((n) => n.id));
  return roots.filter((r) => r.lateralDeId == null || !ids.has(r.lateralDeId));
}

/** Ancho natural del organigrama entero, sin escalar. */
export function anchoNatural(roots: OrgChartNode[], compacto: boolean): number {
  const todos = flattenOrgNodes(roots);
  const visibles = raicesDibujadas(roots);
  if (visibles.length === 0) return ANCHO_TARJETA;
  return (
    visibles.reduce((total, r) => total + anchoDeRama(r, compacto, todos), 0) +
    HUECO * (visibles.length - 1)
  );
}

/**
 * ¿Hay que apilar? Sí cuando el árbol extendido obligaría a un zoom por debajo de
 * lo legible. Es una decisión **pura** sobre la forma del árbol: se calcula desde
 * los datos, no desde el DOM, así que no puede entrar en el bucle medir → escalar
 * → volver a medir que tenía frito al ajuste automático.
 */
export function convieneCompacto(
  roots: OrgChartNode[],
  anchoDisponible: number,
  zoomMinimoLegible: number,
): boolean {
  if (anchoDisponible <= 0) return false;
  return anchoNatural(roots, false) * zoomMinimoLegible > anchoDisponible;
}
