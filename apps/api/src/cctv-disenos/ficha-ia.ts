/**
 * Leer la memoria técnica de un equipo: lo puro de esa lectura (qué hojas se le enseñan a la IA, qué
 * se le pide y cómo se limpia lo que responde). Sin red ni archivos, para poder probarlo.
 *
 * Por qué así: viaja el texto de todas las hojas más dos hojas como imagen (la portada, para el color
 * y la forma, y la del dibujo de dimensiones, que suele traer sus cifras dentro de la imagen). Pesa lo
 * mismo en un PDF de 1 MB que en uno de 30, y la puerta no acepta más de 2 MB por petición.
 *
 * La IA nunca decide sola: la pantalla enseña cada dato con la hoja de donde salió y una persona lo
 * confirma. Lo que no aparece en el documento se queda vacío.
 */
import { TIPOS_POR_FAMILIA } from './catalogo-cctv.js';

export const CONFIG_FICHA = {
  modelo: 'claude-haiku-5-5',
  esfuerzo: 'low' as const,
  pensar: false,
  maxTokens: 2400,
  timeoutMs: 60_000,
  reintentos: 1,
};

/** Menos de esto en todo el PDF: es un escaneo y las hojas se leen como imagen. */
export const MINIMO_TEXTO_FICHA = 200;
export const TOPE_TEXTO_FICHA = 60_000;
/** Cuántas hojas se mandan como imagen si el PDF no trae texto. */
export const HOJAS_SI_ES_ESCANEO = 4;

/** Campos que se le piden: los que dan el comportamiento, el modelo 3D y lo que se lee en la ficha. */
export const CAMPOS_FICHA = [
  'pxHoriz',
  'pxVert',
  'sensor',
  'focalesMm',
  'focalMinMm',
  'focalMaxMm',
  'hfovDeg',
  'vfovDeg',
  'zoomOptico',
  'irM',
  'diametroMm',
  'anchoMm',
  'altoMm',
  'fondoMm',
  'altoCarcasaMm',
  'radioCupulaMm',
  'pesoG',
  'ip',
  'ik',
  'wattsMax',
  'poeW',
  'canales',
  'bahias',
  'mbpsEntrada',
  'puertos',
  'puertosPoe',
  'poeTotalW',
  'unidades',
  'plumaM',
  'alcanceM',
  'decibeles',
  'pantallaPulgadas',
] as const;

export type CampoFicha = (typeof CAMPOS_FICHA)[number];

/** Lo que no es número. */
const CAMPOS_TEXTO: ReadonlySet<CampoFicha> = new Set<CampoFicha>(['sensor', 'focalesMm', 'ip', 'ik']);

const TIPOS = Object.values(TIPOS_POR_FAMILIA).flat();

export const ESQUEMA_FICHA = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo', 'marca', 'modelo', 'descripcion', 'color', 'cajaTrasera', 'lucesVisibles', 'datos', 'caracteristicas'],
  properties: {
    tipo: { type: 'string', enum: TIPOS },
    marca: { type: 'string' },
    modelo: { type: 'string' },
    descripcion: { type: 'string' },
    color: { type: 'string', enum: ['blanco', 'negro', 'gris', 'otro'] },
    cajaTrasera: { type: 'boolean' },
    lucesVisibles: { type: 'integer' },
    datos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['campo', 'valor', 'hoja'],
        properties: {
          campo: { type: 'string', enum: CAMPOS_FICHA },
          valor: { type: 'string' },
          hoja: { type: 'integer' },
        },
      },
    },
    caracteristicas: { type: 'array', items: { type: 'string' } },
  },
};

export const SISTEMA_FICHA = `Lees memorias técnicas (hojas de datos) de equipos de seguridad electrónica y TI para llenar el catálogo de NEXARA. Sacas solo lo que el documento dice: si un dato no aparece, no lo incluyes. Nunca inventes ni completes con lo típico.

Cada hoja del texto empieza con «[Hoja N]». En cada dato pones la hoja de donde lo sacaste; si salió de una imagen, la hoja de esa imagen.

Tipo, por el título del documento y por la foto:
- domo: cúpula transparente sobre una base. turret: bola sobre un aro, sin cúpula. bala: cuerpo cilíndrico con brazo. ptz: motorizada con zoom. panoramica y ojo-de-pez: lentes de 180° o 360°.
- nvr: grabador de red, también DVR. switch: conmutador de red. servidor: servidor o almacenamiento en rack. ups: respaldo de energía. gabinete: rack o gabinete.
- terminal: terminal de acceso, lectora o controlador de puerta. barrera: barrera vehicular o pluma.
- sirena: sirena o sonador. sismica: receptor de alerta sísmica. panel: panel o kit de alarma; en un kit describe la unidad principal y sus medidas.
- generico: cualquier otra cosa. No fuerces un tipo que no corresponde.

Datos:
- valor es el número solo, sin unidades, salvo sensor, ip, ik y focalesMm.
- pxHoriz y pxVert: la resolución máxima. sensor: su formato, como 1/3. ip e ik: como IP67 o IK08.
- Varias focales opcionales: focalesMm lista todas separadas por comas, y hfovDeg y vfovDeg son los de la primera. Varifocal o motorizada: focalMinMm y focalMaxMm son los extremos y hfovDeg es el mayor.
- irM: alcance de la luz (IR o luz blanca), en metros, el mayor que diga.
- Sirve para cualquier marca y en español o inglés: Dahua, Axis, TP-Link, ZKTeco, Hikvision o la que sea. marca es la del documento, nunca supongas otra.
- Si las medidas vienen en pulgadas y en milímetros, usa los milímetros. Φ o ø es diámetro.
- Medidas y peso del equipo, nunca los del empaque (Package o paquete), salvo que en esa sección digan «Body» o «Housing» sin «with Package»: esos son del equipo. Redondo: Ø en diametroMm y la altura en altoMm. Si dice ancho × alto × fondo, respeta el orden que indique el documento; si no lo indica, en un equipo de rack o de escritorio el número menor es el alto.
- altoCarcasaMm: altura de la carcasa sin cúpula. radioCupulaMm: radio de la cúpula, marcado SR o R. Búscalos en la imagen del dibujo de dimensiones, cuyas cotas van en mm con las pulgadas entre paréntesis: 50.1(2.0") es 50.1. Solo si el dibujo los marca.
- pesoG: en gramos, del equipo sin empaque. Si dice kg, convierte a gramos. Con tolerancia o tope, como 43 ± 3 kg o ≤ 1 kg, solo la cifra: 43 o 1.
- poeW: lo que consume por PoE. wattsMax: el máximo que diga en cualquier alimentación. poeTotalW: el presupuesto PoE total de un switch. puertos: los puertos de red de usuario, sin contar los de subida (uplink, SFP o el RJ45 aparte). puertosPoe: cuántos dan PoE.
- canales: canales IP de un grabador. bahias: bahías de disco. mbpsEntrada: ancho de banda de entrada del grabador. unidades: unidades de rack (U).
- plumaM: largo total de la pluma, en metros; si hay varios, el primero. Si viene por tramos, súmalos: «1.5 + 1.5 m» son 3. alcanceM: hasta dónde se escucha o alcanza, en metros, solo si lo dice. decibeles: lo fuerte que suena. pantallaPulgadas: tamaño de la pantalla.

color: por la foto principal, y «otro» si no hay foto o no es ninguno de esos. cajaTrasera: true solo si la foto enseña una caja grande atrás, con bocina o de conexiones. lucesVisibles: cuántas luces IR o blancas se ven en la foto; 0 si no se distinguen.
descripcion: una línea en español de lo que es, sin copiar el nombre del modelo. caracteristicas: hasta 5 frases cortas en español con lo que más importa para vender o instalar.
marca: el fabricante. modelo: la clave exacta del producto, como viene en el título.`;

/**
 * La hoja del dibujo de dimensiones. El título «Dimension» va solo en su renglón; si cae al final de una
 * hoja, el dibujo está en la siguiente. Se busca de atrás hacia adelante porque la tabla de
 * especificaciones, antes, también dice «Dimension», pero seguida de muchos renglones más.
 */
export function hojaDelDibujo(paginas: readonly string[]): number | null {
  const total = paginas.length;
  for (let i = total; i >= 2; i--) {
    const lineas = paginas[i - 1].split('\n').map((l) => l.replace(/\s/g, '')).filter(Boolean);
    const k = lineas.findIndex((l) => /^[^a-z0-9]{0,3}(product)?(dimensions?|dimensiones|medidas)(\(mm.*\))?$/i.test(l));
    if (k < 0) continue;
    const quedan = lineas.length - k - 1;
    return quedan < 3 && i < total ? i + 1 : i;
  }
  return null;
}

/** Las hojas que se mandan como imagen: la portada y la del dibujo. Si no hay texto, las primeras. */
export function hojasParaImagen(paginas: readonly string[]): number[] {
  const total = paginas.length;
  if (!total) return [];
  const conTexto = paginas.reduce((a, p) => a + p.trim().length, 0);
  if (conTexto < MINIMO_TEXTO_FICHA) return Array.from({ length: Math.min(total, HOJAS_SI_ES_ESCANEO) }, (_, i) => i + 1);
  const dibujo = hojaDelDibujo(paginas);
  if (dibujo && dibujo !== 1) return [1, dibujo];
  // Sin una hoja clara, la última con contenido: la de después suele ser solo la contraportada.
  for (let i = total; i >= 2; i--) if (paginas[i - 1].trim().length > 30) return [1, i];
  return [1];
}

/** El mensaje: cada hoja con su número, sin pasarse del tope. */
export function textoParaIa(paginas: readonly string[]): string {
  const hojas = paginas
    .map((p, i) => ({ n: i + 1, t: p.replace(/[ \t]{2,}/g, '  ').replace(/\n{3,}/g, '\n\n').trim() }))
    .filter((h) => h.t)
    .map((h) => `[Hoja ${h.n}]\n${h.t}`);
  return hojas.join('\n\n').slice(0, TOPE_TEXTO_FICHA);
}

export function peticionFicha(paginas: readonly string[], nombresImagen: readonly number[]) {
  const quien = nombresImagen.length ? `Las imágenes son las hojas ${nombresImagen.join(' y ')}. ` : '';
  const texto = textoParaIa(paginas);
  return {
    sistema: [SISTEMA_FICHA],
    usuario: `${quien}Llena el catálogo con esta memoria técnica.\n\n${texto || '(El PDF no trae texto: lee las imágenes.)'}`,
    esquema: ESQUEMA_FICHA,
    modelo: CONFIG_FICHA.modelo,
    esfuerzo: CONFIG_FICHA.esfuerzo,
    pensar: CONFIG_FICHA.pensar,
    maxTokens: CONFIG_FICHA.maxTokens,
    timeoutMs: CONFIG_FICHA.timeoutMs,
    reintentos: CONFIG_FICHA.reintentos,
  };
}

/** Un dato leído, con la hoja de donde salió. */
export type DatoLeido = { campo: CampoFicha; valor: string; hoja: number | null };

export type FichaLeida = {
  familia: string;
  tipo: string;
  marca: string;
  modelo: string;
  descripcion: string;
  color: 'blanco' | 'negro' | 'gris';
  cajaTrasera: boolean;
  lucesVisibles: number;
  datos: DatoLeido[];
  caracteristicas: string[];
};

export function familiaDeTipo(tipo: string): string {
  return Object.entries(TIPOS_POR_FAMILIA).find(([, tipos]) => tipos.includes(tipo))?.[0] ?? 'otros';
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Convierte «2.8 mm» o «1,200» en número. Null si no lo es o es un disparate. */
export function numeroDe(v: string): number | null {
  const limpio = v.replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(',', '.');
  const m = /[-+]?\d+(?:\.\d+)?/.exec(limpio);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? n : null;
}

/**
 * Lo que la IA contestó, limpio: tipo conocido, un renglón por campo (gana el primero), números que
 * sí son números y hojas que sí existen. Lo que no pasa, se quita: mejor un dato vacío que uno falso.
 */
/**
 * Cada fabricante ordena sus medidas como quiere («L × A × H», «W × D × H»), pero la forma del equipo
 * dice cuál es cuál: lo de muro es delgado y lo de rack es plano. Solo aplica si vienen las tres.
 */
const LO_DE_MURO = new Set(['terminal', 'panel', 'sirena', 'sismica']);
const LO_DE_RACK = new Set(['nvr', 'switch', 'servidor', 'ups']);

function ordenarMedidas(tipo: string, datos: DatoLeido[]) {
  const de = (campo: CampoFicha) => datos.find((d) => d.campo === campo);
  const ancho = de('anchoMm');
  const alto = de('altoMm');
  const fondo = de('fondoMm');
  if (!ancho || !alto || !fondo || (!LO_DE_MURO.has(tipo) && !LO_DE_RACK.has(tipo))) return;
  const [mayor, medio, menor] = [ancho.valor, alto.valor, fondo.valor].map(Number).sort((a, b) => b - a).map(String);
  if (LO_DE_MURO.has(tipo)) {
    alto.valor = mayor;
    ancho.valor = medio;
    fondo.valor = menor;
  } else {
    ancho.valor = mayor;
    fondo.valor = medio;
    alto.valor = menor;
  }
}

/** «Dahua Technology» y «Dahua» son la misma marca. Es la misma regla que `marcaCorta` en la web. */
function sinRazonSocial(marca: string): string {
  const fuera = /[\s,]+(network\s+)?(technolog(y|ies)|tech|corporation|corp\.?|company|co\.?|ltd\.?|limited|inc\.?|llc|s\.?a\.?(\s+de\s+c\.?v\.?)?|gmbh)\b\.?/gi;
  return marca.replace(fuera, '').replace(/[\s,.]+$/, '').trim() || marca;
}

export function limpiarFicha(bruto: Record<string, any>, totalHojas: number): FichaLeida {
  const tipo = TIPOS.includes(bruto?.tipo) ? String(bruto.tipo) : 'generico';
  const vistos = new Set<string>();
  const datos: DatoLeido[] = [];
  for (const d of Array.isArray(bruto?.datos) ? bruto.datos : []) {
    const campo = d?.campo as CampoFicha;
    if (!CAMPOS_FICHA.includes(campo) || vistos.has(campo)) continue;
    const crudo = texto(d?.valor, 80);
    if (!crudo) continue;
    let valor = crudo;
    if (!CAMPOS_TEXTO.has(campo)) {
      const n = numeroDe(crudo);
      if (n === null || n === 0) continue;
      valor = String(n);
    }
    const hoja = Number(d?.hoja);
    vistos.add(campo);
    datos.push({ campo, valor, hoja: Number.isInteger(hoja) && hoja >= 1 && hoja <= totalHojas ? hoja : null });
  }
  ordenarMedidas(tipo, datos);
  // Para revisar el switch cuentan los puertos que dan PoE: la ficha a veces suma también los de subida.
  const poe = datos.find((d) => d.campo === 'puertosPoe');
  const puertos = datos.find((d) => d.campo === 'puertos');
  if (poe && puertos) puertos.valor = poe.valor;
  // Cotas imposibles: la IA leyó otra cifra del dibujo. Mejor vacío, y el modelo usa su proporción típica.
  const numeroCampo = (campo: CampoFicha) => {
    const d = datos.find((x) => x.campo === campo);
    return d ? Number(d.valor) : null;
  };
  const alto = numeroCampo('altoMm');
  const diametro = numeroCampo('diametroMm');
  const carcasa = numeroCampo('altoCarcasaMm');
  const cupula = numeroCampo('radioCupulaMm');
  const quitar = (campo: CampoFicha) => datos.splice(datos.findIndex((x) => x.campo === campo), 1);
  if (carcasa !== null && alto !== null && carcasa >= alto) quitar('altoCarcasaMm');
  if (cupula !== null && diametro !== null && cupula > diametro / 2) quitar('radioCupulaMm');
  const color = bruto?.color === 'negro' || bruto?.color === 'gris' ? bruto.color : 'blanco';
  const luces = Number(bruto?.lucesVisibles);
  return {
    familia: familiaDeTipo(tipo),
    tipo,
    marca: sinRazonSocial(texto(bruto?.marca, 80)),
    modelo: texto(bruto?.modelo, 120),
    descripcion: texto(bruto?.descripcion, 300),
    color,
    cajaTrasera: bruto?.cajaTrasera === true,
    lucesVisibles: Number.isInteger(luces) && luces >= 0 && luces <= 24 ? luces : 0,
    datos,
    caracteristicas: (Array.isArray(bruto?.caracteristicas) ? bruto.caracteristicas : [])
      .map((c: unknown) => texto(c, 160))
      .filter(Boolean)
      .slice(0, 5),
  };
}
