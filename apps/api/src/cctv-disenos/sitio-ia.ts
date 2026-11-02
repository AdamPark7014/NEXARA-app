/**
 * La IA del Diseñador que casi no gasta: de una frase a unos cuantos datos. Lo demás, muros, cámaras y
 * cable, lo arma el código en la web (`lib/cctv/generarSitio.ts`). Solo viaja la frase: ni catálogo, ni
 * clientes, ni el diseño. Lo mismo para generar un equipo cuando no se tiene su PDF.
 */
import { ESQUEMA_FICHA } from './ficha-ia.js';

export const MAX_FRASE_DISENO = 1_500;
export const MIN_FRASE_DISENO = 3;

export const CONFIG_FRASE = {
  modelo: 'claude-haiku-5-5',
  esfuerzo: 'low' as const,
  pensar: false,
  timeoutMs: 15_000,
  reintentos: 1,
};

const TIPOS_AREA = ['bodega', 'oficina', 'recepcion', 'ti', 'sala', 'tienda', 'aula', 'pasillo', 'estacionamiento', 'patio', 'otro'] as const;

/** Sin nulos: un 0 o un vacío quiere decir «no lo dijo». La API limita los campos que pueden serlo. */
export const ESQUEMA_SITIO = {
  type: 'object',
  additionalProperties: false,
  required: ['anchoM', 'fondoM', 'alturaM', 'camaras', 'accesos', 'barrera', 'sismica', 'sirena', 'grabacionDias', 'marca', 'areas'],
  properties: {
    anchoM: { type: 'number' },
    fondoM: { type: 'number' },
    alturaM: { type: 'number' },
    camaras: { type: 'integer' },
    accesos: { type: 'integer' },
    barrera: { type: 'boolean' },
    sismica: { type: 'integer' },
    sirena: { type: 'integer' },
    grabacionDias: { type: 'integer' },
    marca: { type: 'string' },
    areas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'tipo', 'm2', 'piso', 'camaras'],
        properties: {
          nombre: { type: 'string' },
          tipo: { type: 'string', enum: TIPOS_AREA },
          m2: { type: 'number' },
          piso: { type: 'integer' },
          camaras: { type: 'integer' },
        },
      },
    },
  },
};

export const SISTEMA_SITIO = `Conviertes lo que alguien describe de un sitio en datos para armar su diseño de videovigilancia. Pon solo lo que la frase dice o se deduce directo de ella. Lo que no diga va en 0, false o vacío: el sistema lo resuelve después. Nunca inventes medidas ni cantidades.

anchoM y fondoM: las medidas del edificio, si las da («40 por 25»). alturaM: su altura.
camaras: el total que pide. accesos: cuántas puertas llevan control de acceso («la entrada y el cuarto de TI» son 2). barrera: si pide barrera o pluma vehicular. sismica: cuántas alertas sísmicas; 1 si la pide sin número. sirena: igual. grabacionDias: los días de grabación. marca: la marca que pide para las cámaras.

areas: cada espacio que mencione, con nombre corto en español y su tipo:
- bodega: almacén, nave, planta, taller. tienda: piso de venta, local. oficina: oficinas, dirección, administración. recepcion: recepción, entrada, vestíbulo. ti: cuarto de TI, site, cuarto de servidores. sala: sala de juntas. aula: salón, laboratorio. pasillo: pasillos, salones juntos. estacionamiento. patio: patio, maniobras, andén al aire libre. otro: lo demás.
- m2: si da los metros o las medidas de esa área («de 20 por 30» son 600). piso: 0 es la planta baja, 1 el primer piso. camaras: si pide un número para esa área.
- Si no menciona áreas pero dice el giro, pon las obvias: una bodega lleva bodega, oficinas y cuarto de TI; una escuela lleva salones, dirección, recepción, cuarto de TI y patio; una tienda lleva piso de venta y cuarto de TI; unas oficinas llevan oficinas, recepción y cuarto de TI.`;

export const SISTEMA_DESCRIPCION = `Conviertes lo que alguien describe de un equipo de seguridad electrónica o TI en datos para el catálogo, de cualquier marca. Pon solo lo que la frase dice: lo que no diga no se incluye. Nunca completes con lo típico ni con lo que recuerdes de ese modelo; quien captura lo revisa con la ficha.

Tipo: domo, turret (bola sobre aro), bala, ptz, panoramica, ojo-de-pez, nvr (grabador o DVR), switch, servidor, ups, gabinete, terminal (terminal de acceso, lectora, controlador), barrera, sirena, sismica, panel (panel de alarma), generico.
En datos, un renglón por cada dato dicho, con hoja 0 y valor solo el número salvo sensor, ip, ik y focalesMm. «4 MP» son pxHoriz 2560 y pxVert 1440; «2 MP» 1920 y 1080; «5 MP» 2592 y 1944; «8 MP» 3840 y 2160. «De 8 canales» es canales. «24 puertos» es puertos. «De 2U» es unidades. «Lente de 2.8» es focalesMm.
color: blanco, negro o gris si lo dice; «otro» si no. cajaTrasera: false salvo que lo diga. lucesVisibles: 0.
descripcion: una línea en español de lo que es. caracteristicas: vacío. marca y modelo: como los diga, vacío si no.`;

const limpiar = (frase: string) => frase.replace(/\s+/g, ' ').trim().slice(0, MAX_FRASE_DISENO);

export function peticionSitio(frase: string) {
  return {
    sistema: [SISTEMA_SITIO],
    usuario: limpiar(frase),
    esquema: ESQUEMA_SITIO,
    modelo: CONFIG_FRASE.modelo,
    esfuerzo: CONFIG_FRASE.esfuerzo,
    pensar: CONFIG_FRASE.pensar,
    maxTokens: 700,
    timeoutMs: CONFIG_FRASE.timeoutMs,
    reintentos: CONFIG_FRASE.reintentos,
  };
}

export function peticionDescripcion(frase: string) {
  return {
    sistema: [SISTEMA_DESCRIPCION],
    usuario: limpiar(frase),
    esquema: ESQUEMA_FICHA,
    modelo: CONFIG_FRASE.modelo,
    esfuerzo: CONFIG_FRASE.esfuerzo,
    pensar: CONFIG_FRASE.pensar,
    maxTokens: 500,
    timeoutMs: CONFIG_FRASE.timeoutMs,
    reintentos: CONFIG_FRASE.reintentos,
  };
}

export type AreaSitio = { nombre: string; tipo: string; m2: number; piso: number; camaras: number };

export type SitioLeido = {
  anchoM: number;
  fondoM: number;
  alturaM: number;
  camaras: number;
  accesos: number;
  barrera: boolean;
  sismica: number;
  sirena: number;
  grabacionDias: number;
  marca: string;
  areas: AreaSitio[];
};

/** Un número razonable, o 0: una cifra disparatada no debe armar un edificio de un kilómetro. */
const cifra = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= max ? n : 0;
};

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Lo que contesta la IA, con todo en rango. Lo que no pasa queda como «no lo dijo». */
export function limpiarSitio(bruto: Record<string, any> | null | undefined): SitioLeido {
  const areas = (Array.isArray(bruto?.areas) ? bruto.areas : [])
    .slice(0, 12)
    .map((a: any) => ({
      nombre: texto(a?.nombre, 60),
      tipo: (TIPOS_AREA as readonly string[]).includes(a?.tipo) ? String(a.tipo) : 'otro',
      m2: cifra(a?.m2, 200_000),
      piso: Math.round(cifra(a?.piso, 20)),
      camaras: Math.round(cifra(a?.camaras, 200)),
    }))
    .filter((a: AreaSitio) => a.nombre);
  return {
    anchoM: cifra(bruto?.anchoM, 1000),
    fondoM: cifra(bruto?.fondoM, 1000),
    alturaM: cifra(bruto?.alturaM, 40),
    camaras: Math.round(cifra(bruto?.camaras, 500)),
    accesos: Math.round(cifra(bruto?.accesos, 50)),
    barrera: bruto?.barrera === true,
    sismica: Math.round(cifra(bruto?.sismica, 30)),
    sirena: Math.round(cifra(bruto?.sirena, 30)),
    grabacionDias: Math.round(cifra(bruto?.grabacionDias, 365)),
    marca: texto(bruto?.marca, 60),
    areas,
  };
}

/** Lo que la frase nombra con todas sus letras. El modelo barato a veces deja fuera justo lo que describe el edificio entero. */
const MENCIONES: ReadonlyArray<{ tipo: string; nombre: string; patron: RegExp }> = [
  { tipo: 'bodega', nombre: 'Bodega', patron: /\b(bodegas?|almac[eé]n|almacenes|naves?|taller(es)?)\b/i },
  { tipo: 'tienda', nombre: 'Piso de venta', patron: /\b(tiendas?|piso de venta|local comercial)\b/i },
  { tipo: 'oficina', nombre: 'Oficinas', patron: /\b(oficinas?|direcci[oó]n|administraci[oó]n)\b/i },
  { tipo: 'recepcion', nombre: 'Recepción', patron: /\b(recepci[oó]n|vest[ií]bulo)\b/i },
  { tipo: 'ti', nombre: 'Cuarto de TI', patron: /\b(site|cuarto de (ti|servidores|sistemas|telecom\w*))\b/i },
  { tipo: 'sala', nombre: 'Sala de juntas', patron: /\bsalas? de juntas\b/i },
  { tipo: 'estacionamiento', nombre: 'Estacionamiento', patron: /\bestacionamientos?\b/i },
  { tipo: 'patio', nombre: 'Patio', patron: /\b(patios?|maniobras)\b/i },
];

/** Se agrega lo que la frase dice y a la lista le falta. Solo eso: no inventa áreas ni medidas. */
export function completarAreas(sitio: SitioLeido, frase: string): SitioLeido {
  const faltan = MENCIONES.filter((m) => m.patron.test(frase) && !sitio.areas.some((a) => a.tipo === m.tipo));
  if (!faltan.length) return sitio;
  return { ...sitio, areas: [...sitio.areas, ...faltan.map((m) => ({ nombre: m.nombre, tipo: m.tipo, m2: 0, piso: 0, camaras: 0 }))] };
}
