/**
 * Parser XML mínimo para respuestas ISAPI.
 *
 * ISAPI responde XML por defecto. `?format=json` existe en firmwares recientes
 * pero **no en todas las rutas ni en todos los modelos**: las DS-K1T3xx viejas
 * lo ignoran y devuelven XML igual, con `Content-Type: application/json`.
 * Por eso el cliente parsea siempre lo que llega, y no lo que promete el header.
 *
 * No se añade una dependencia (`fast-xml-parser`) porque de estas respuestas
 * solo se leen escalares y listas de nodos: no hay namespaces que resolver,
 * ni CDATA, ni atributos que importen salvo los que se ignoran a propósito.
 */

export type XmlNode = string | { [key: string]: XmlValue };
export type XmlValue = XmlNode | XmlNode[];

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|apos|#\d+);/g, (m) =>
    m.startsWith('&#') ? String.fromCharCode(Number(m.slice(2, -1))) : (ENTITIES[m] ?? m),
  );
}

/** Quita el prefijo de namespace: `<hik:model>` → `model`. */
function localName(tag: string): string {
  const i = tag.indexOf(':');
  return i === -1 ? tag : tag.slice(i + 1);
}

/**
 * Devuelve el contenido del documento como objeto anidado.
 * Los hermanos con el mismo nombre se colapsan en un array.
 */
export function parseXml(input: string): Record<string, XmlValue> {
  const src = input
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c: string) => c);

  const root: Record<string, XmlValue> = {};
  const stack: Array<Record<string, XmlValue>> = [root];
  const names: string[] = [];
  let text = '';

  const tagRe = /<\s*(\/?)\s*([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)\s*>/g;
  let m: RegExpExecArray | null;
  let last = 0;

  const attach = (name: string, value: XmlValue) => {
    const parent = stack[stack.length - 1];
    const prev = parent[name];
    if (prev === undefined) parent[name] = value;
    else if (Array.isArray(prev)) prev.push(value as XmlNode);
    else parent[name] = [prev as XmlNode, value as XmlNode];
  };

  while ((m = tagRe.exec(src)) !== null) {
    text += src.slice(last, m.index);
    last = tagRe.lastIndex;

    const [, closing, rawTag, , selfClosing] = m;
    const name = localName(rawTag);

    if (closing) {
      const open = names.pop();
      const node = stack.pop();
      if (open === undefined || node === undefined) continue;
      const trimmed = decodeEntities(text).trim();
      // Nodo hoja → su texto. Nodo con hijos → el objeto (el texto suelto se descarta).
      attach(open, Object.keys(node).length === 0 ? trimmed : node);
      text = '';
      continue;
    }

    if (selfClosing) {
      attach(name, '');
      text = '';
      continue;
    }

    // Apertura: el texto acumulado pertenecía al padre y no se usa.
    text = '';
    names.push(name);
    stack.push({});
  }

  return root;
}

/** Navega `a.b.c` tolerando arrays (toma el primero) y devuelve string o null. */
export function pick(obj: unknown, path: string): string | null {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (Array.isArray(cur)) cur = cur[0];
    if (cur === null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (Array.isArray(cur)) cur = cur[0];
  return typeof cur === 'string' ? cur : null;
}

/** Devuelve siempre un array: los nodos únicos no vienen envueltos. */
export function asList(value: unknown): Record<string, XmlValue>[] {
  if (value === undefined || value === null || value === '') return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.filter((v): v is Record<string, XmlValue> => typeof v === 'object' && v !== null);
}
