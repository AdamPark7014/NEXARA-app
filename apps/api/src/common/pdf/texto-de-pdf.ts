import zlib from 'zlib';

/**
 * Texto de cada hoja de un PDF hecho con PDFKit, en orden de hojas. Es para las pruebas: permite
 * comprobar que un campo sale impreso sin depender de una biblioteca de PDF.
 *
 * Con fuentes estándar (Helvetica) PDFKit escribe el texto en WinAnsi: cada byte del hexadecimal es
 * un carácter latin1. Con fuentes embebidas (Montserrat, Inter) lo escribe en Identity-H: cada
 * glifo son dos bytes y el carácter sale del mapa `ToUnicode` de esa fuente. Cada `TJ` es un
 * renglón de la salida.
 */
export function textoPorHoja(pdf: Buffer): string[] {
  const fuente = pdf.toString('latin1');
  const objetos = leerObjetos(fuente);

  // Recurso (/F3) → mapa glifo → texto de su ToUnicode; `null` = fuente estándar en WinAnsi.
  const mapas = new Map<number, Map<number, string> | null>();
  const mapaDeObjeto = (num: number) => {
    if (mapas.has(num)) return mapas.get(num)!;
    const dict = objetos.get(num)?.dict ?? '';
    const ref = /\/ToUnicode (\d+) 0 R/.exec(dict);
    const flujo = ref ? objetos.get(Number(ref[1]))?.flujo : null;
    const mapa = flujo ? leerToUnicode(inflar(flujo)) : null;
    mapas.set(num, mapa);
    return mapa;
  };
  const recursos = new Map<string, number>();
  for (const { dict } of objetos.values()) {
    const bloque = /\/Font\s*<<([\s\S]*?)>>/.exec(dict);
    if (!bloque) continue;
    for (const [, nombre, num] of bloque[1]!.matchAll(/\/(\w+) (\d+) 0 R/g)) recursos.set(nombre!, Number(num));
  }

  const raiz = [...objetos.values()].find(({ dict }) => /\/Type \/Pages\b/.test(dict) && /\/Kids/.test(dict));
  const hijos = [...(/\/Kids \[([^\]]*)\]/.exec(raiz?.dict ?? '')?.[1] ?? '').matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));

  return hijos.map((num) => {
    const contenido = /\/Contents (\d+) 0 R/.exec(objetos.get(num)?.dict ?? '');
    const flujo = contenido ? objetos.get(Number(contenido[1]))?.flujo : null;
    if (!flujo) return '';
    const operadores = inflar(flujo).toString('latin1');
    let mapa: Map<number, string> | null = null;
    const renglones: string[] = [];
    for (const m of operadores.matchAll(/\/(\w+)\s+[\d.]+\s+Tf|\[([^\]]*)\]\s*TJ/g)) {
      if (m[1]) {
        const num = recursos.get(m[1]);
        mapa = num === undefined ? null : mapaDeObjeto(num);
        continue;
      }
      const partes = [...m[2]!.matchAll(/<([0-9a-fA-F]*)>/g)].map(([, hex]) => decodificar(hex!, mapa));
      renglones.push(partes.join(''));
    }
    return renglones.join('\n');
  });
}

type Objeto = { dict: string; flujo: Buffer | null };

/** Objetos `n 0 obj` con su diccionario y, si lo tiene, su flujo crudo (medido con /Length). */
function leerObjetos(fuente: string): Map<number, Objeto> {
  const objetos = new Map<number, Objeto>();
  const inicio = /(\d+) 0 obj\s*/g;
  let m: RegExpExecArray | null;
  while ((m = inicio.exec(fuente))) {
    let i = inicio.lastIndex;
    let dict = '';
    if (fuente.startsWith('<<', i)) {
      let nivel = 0;
      const desde = i;
      while (i < fuente.length) {
        if (fuente.startsWith('<<', i)) {
          nivel += 1;
          i += 2;
        } else if (fuente.startsWith('>>', i)) {
          nivel -= 1;
          i += 2;
          if (nivel === 0) break;
        } else {
          i += 1;
        }
      }
      dict = fuente.slice(desde, i);
    }
    let flujo: Buffer | null = null;
    const tras = /^\s*stream\r?\n/.exec(fuente.slice(i, i + 16));
    const largo = /\/Length (\d+)(?! \d+ R)/.exec(dict);
    if (tras && largo) {
      const desde = i + tras[0].length;
      flujo = Buffer.from(fuente.slice(desde, desde + Number(largo[1])), 'latin1');
      i = desde + Number(largo[1]);
    }
    objetos.set(Number(m[1]), { dict, flujo });
    inicio.lastIndex = i;
  }
  return objetos;
}

function inflar(flujo: Buffer): Buffer {
  try {
    return zlib.inflateSync(flujo);
  } catch {
    return flujo;
  }
}

/** Mapa glifo → texto de un CMap ToUnicode (`bfrange` con arreglo y `bfchar`, como los escribe PDFKit). */
function leerToUnicode(cmap: Buffer): Map<number, string> {
  const texto = cmap.toString('latin1');
  const mapa = new Map<number, string>();
  const utf16 = (hex: string) => {
    const limpio = hex.replace(/\s+/g, '');
    let s = '';
    for (let i = 0; i + 4 <= limpio.length; i += 4) s += String.fromCharCode(parseInt(limpio.slice(i, i + 4), 16));
    return s;
  };
  for (const [, desde, , arreglo] of texto.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([^\]]*)\]/g)) {
    [...arreglo!.matchAll(/<([^>]*)>/g)].forEach(([, hex], i) => mapa.set(parseInt(desde!, 16) + i, utf16(hex!)));
  }
  for (const [, bloque] of texto.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, glifo, hex] of bloque!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) mapa.set(parseInt(glifo!, 16), utf16(hex!));
  }
  return mapa;
}

function decodificar(hex: string, mapa: Map<number, string> | null): string {
  if (!mapa) return Buffer.from(hex, 'hex').toString('latin1');
  let s = '';
  for (let i = 0; i + 4 <= hex.length; i += 4) s += mapa.get(parseInt(hex.slice(i, i + 4), 16)) ?? '';
  return s;
}
