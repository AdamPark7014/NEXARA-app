/**
 * «Redactar con IA»: los textos de la cotización (título, alcance ejecutivo y sus cuatro puntos),
 * escritos con lo que de verdad se cotiza. A Claude solo le llegan las partidas: ni cliente, ni
 * proyecto, ni precios. Los títulos de los puntos los pone el código (`alcance-por-omision.ts`).
 *
 * Lo que devuelve se revisa aquí antes de usarse (`revisarRedaccion`): una cifra o un modelo que no
 * está en las partidas, una instalación que nadie cotizó o un precio se quitan con todo y su frase.
 * Modelo y parámetros medidos con el eval (`npm run eval:redactar -w apps/api`).
 */
import { grupoDePartida, importeDePartida, type PartidaAgrupable } from '../../cotizaciones/partidas-grupos.js';

export type PartidaParaRedactar = PartidaAgrupable & { brand?: string | null; model?: string | null };

export type EntradaRedactar = {
  partidas: PartidaParaRedactar[];
  segmento?: string | null;
  /** Lo que quien cotiza quiso aclarar. Lo que dice aquí cuenta como dato válido al revisar. */
  indicacion?: string | null;
  /** Título de cada punto, en orden: la IA escribe el contenido, no el título. */
  titulos: string[];
};

export type PuntoRedactado = { texto: string; vinetas: string[] };

export type SalidaRedactar = {
  proyecto: string;
  intro: string;
  beneficios: string[];
  resultado: string;
  puntos: PuntoRedactado[];
};

export const ESQUEMA_REDACTAR: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['proyecto', 'intro', 'beneficios', 'resultado', 'puntos'],
  properties: {
    proyecto: { type: 'string' },
    intro: { type: 'string' },
    beneficios: { type: 'array', items: { type: 'string' } },
    resultado: { type: 'string' },
    puntos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['texto', 'vinetas'],
        properties: {
          texto: { type: 'string' },
          vinetas: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

export const PROMPT_REDACTAR = `Redactas la parte escrita de una cotización de NEXARA, integrador mexicano de videovigilancia, control de acceso, redes e infraestructura. El lector es quien decide la compra. Recibes en JSON las partidas cotizadas y los títulos de cuatro puntos.

Entrega:
- proyecto: título de lo que se cotiza, máximo ocho palabras, sin nombre de cliente ni de marca.
- intro: una o dos frases que digan qué se propone, nombrando las familias de equipo con su cantidad. Sin repetir modelos: esos van en la especificación.
- beneficios: hasta tres, cada uno como «Etiqueta: texto», máximo 18 palabras.
- resultado: una frase con lo que el cliente tendrá al final.
- puntos: exactamente cuatro, uno por cada título recibido y en ese orden, cada uno con un párrafo de una o dos frases y hasta cuatro viñetas «Etiqueta: texto» de máximo 25 palabras. El tercero es la especificación: una viñeta por equipo principal, máximo cinco, como «MODELO: qué hace, según su ficha», con el modelo copiado tal cual viene; si no trae modelo, usa su nombre corto.

Reglas que no se rompen:
- Solo afirma lo que sale de las partidas, o lo que es cierto de ese tipo de equipo en general.
- Nunca inventes cifras, marcas, modelos, normas, plazos, lugares ni cantidades. Toda cifra o modelo que escribas debe venir igual en las partidas.
- Si conManoDeObra es false, es venta de suministro: no prometas ni sugieras instalación, configuración, capacitación, puesta en marcha ni levantamiento. Tampoco escribas «instalado», «instalar» ni «configurado»; di «listo para integrarse a su operación».
- No repitas la misma idea en dos partes: cada beneficio y cada viñeta dice algo distinto.
- No hables de precios, márgenes, vigencia ni garantía: van en otra parte del documento.
- Prohibidas las frases vacías: «solución tecnológica confiable», «de vanguardia», «moderna», «mejor desempeño», «riesgos operativos». Tampoco digas «cobertura» si no hay cámaras o antenas.
- Español de México, formal y directo. Sin signos de exclamación. Escribe NEXARA en mayúsculas y nunca nombres al cliente.
- Si llega una indicación de quien cotiza, síguela mientras no choque con estas reglas.`;

export const CONFIG_REDACTAR = {
  modelo: 'claude-haiku-5-5',
  esfuerzo: 'low' as const,
  pensar: false,
  maxTokens: 2200,
  timeoutMs: 20_000,
  reintentos: 1,
};

const MAX_PARTIDAS = 30;
const MAX_NOMBRE = 120;
const MAX_FICHA = 320;
const MAX_INDICACION = 300;
const MAX_BENEFICIOS = 3;
const MAX_VINETAS = 5;
/** Un título más largo ya no cabe en la cabeza de la primera hoja. */
const MAX_PROYECTO = 90;

const corto = (valor: unknown, max: number): string => {
  const limpio = String(valor ?? '').replace(/\s+/g, ' ').trim();
  return limpio.length > max ? `${limpio.slice(0, max).replace(/\s+\S*$/, '')}…` : limpio;
};

export function peticionRedactar(entrada: EntradaRedactar) {
  // Si no caben todas, las de más peso: son las que el texto debe nombrar.
  const partidas = [...entrada.partidas].sort((a, b) => importeDePartida(b) - importeDePartida(a)).slice(0, MAX_PARTIDAS);
  return {
    sistema: [PROMPT_REDACTAR],
    usuario: JSON.stringify({
      segmento: entrada.segmento || null,
      conManoDeObra: partidas.some((p) => grupoDePartida(p) === 'MANO_DE_OBRA'),
      indicacion: corto(entrada.indicacion, MAX_INDICACION) || null,
      titulos: entrada.titulos,
      partidas: partidas.map((p) => ({
        cantidad: Number(p.qty) || 0,
        unidad: p.unit || null,
        grupo: grupoDePartida(p),
        nombre: corto(p.name, MAX_NOMBRE),
        marca: p.brand || null,
        modelo: p.model || null,
        ficha: corto(p.description, MAX_FICHA) || null,
      })),
    }),
    esquema: ESQUEMA_REDACTAR,
    modelo: CONFIG_REDACTAR.modelo,
    esfuerzo: CONFIG_REDACTAR.esfuerzo,
    pensar: CONFIG_REDACTAR.pensar,
    maxTokens: CONFIG_REDACTAR.maxTokens,
    timeoutMs: CONFIG_REDACTAR.timeoutMs,
    reintentos: CONFIG_REDACTAR.reintentos,
  };
}

const plano = (texto: unknown): string =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Las cifras en un solo formato: «1,000» es 1000 y «16,2» es 16.2.
    .replace(/(\d),(\d{3})\b/g, '$1$2')
    .replace(/(\d),(\d)/g, '$1.$2');

const PALABRA = /[a-zñ0-9][a-zñ0-9\-./]*/g;
const CIFRA = /\d+(?:\.\d+)?/g;
const SOLO_CIFRA = /^\d+(?:\.\d+)?$/;

/** Marcas que suelen colarse: si la partida no la trae, la IA la está suponiendo. */
const MARCAS = [
  'hikvision', 'hikrobot', 'dahua', 'axis', 'hanwha', 'bosch', 'uniview', 'ezviz', 'zkteco', 'suprema', 'rosslare', 'zebra',
  'honeywell', 'cisco', 'meraki', 'ubiquiti', 'tp-link', 'aruba', 'ruijie', 'mikrotik', 'panduit', 'belden', 'apc', 'eaton',
  'seagate', 'toshiba', 'lenovo', 'dell', 'epson', 'brother', 'sunmi', 'milesight', 'schneider',
];
// «La misma configuración de hardware» no promete nada; «configurado en sitio», sí.
const INSTALACION = /\binstal(?!aciones\b)|puesta en (marcha|operacion|servicio)|capacitaci|levantamiento|configurad|se configura|configuracion (inicial|en sitio|incluida)/;
const COBERTURA = /\bcobertura\b/;
const CON_COBERTURA = /camara|domo|\bbala\b|turret|cctv|videovigilancia|antena|access point|wi-?fi|\benlace/;
const FUERA_DE_LUGAR = /\$|\bprecio|\bmargen/;
/** Van en la póliza, salvo que sean lo que se vende: una extensión de garantía, una licencia por un año. */
const DE_LA_POLIZA = /\bvigencia|\bgarantia/g;
const SE_VENDE_POR_TIEMPO = /licen|suscrip|poliza|\banual|\banos?\b|\bmeses\b/;

export type Revision = { salida: SalidaRedactar; quitadas: string[] };

/** Lo que permite revisar un texto contra las partidas. */
function fuenteDe(entrada: Pick<EntradaRedactar, 'partidas' | 'indicacion'>) {
  const texto = plano(
    [...entrada.partidas.flatMap((p) => [p.name, p.description, p.brand, p.model, p.unit]), entrada.indicacion].filter(Boolean).join(' \n '),
  );
  const cantidades = entrada.partidas.map((p) => Number(p.qty) || 0);
  const porGrupo = new Map<string, number>();
  entrada.partidas.forEach((p, i) => porGrupo.set(grupoDePartida(p), (porGrupo.get(grupoDePartida(p)) ?? 0) + cantidades[i]!));
  // Sumar las piezas es válido: «220 equipos» cuando son 80, 30 y 110.
  const sumas = [...porGrupo.values(), cantidades.reduce((a, b) => a + b, 0)];
  return {
    texto,
    compacto: texto.replace(/\s+/g, ''),
    cifras: new Set([...(texto.match(CIFRA) ?? []), ...[...cantidades, ...sumas].map(String)]),
    conObra: entrada.partidas.some((p) => grupoDePartida(p) === 'MANO_DE_OBRA'),
    conCobertura: CON_COBERTURA.test(texto),
    porTiempo: SE_VENDE_POR_TIEMPO.test(texto),
  };
}

/** Por qué no se puede usar esta frase; `null` si está bien. */
function motivoDeDuda(frase: string, fuente: ReturnType<typeof fuenteDe>): string | null {
  const t = plano(frase);
  const vale = (parte: string) => (SOLO_CIFRA.test(parte) ? fuente.cifras.has(parte) : fuente.compacto.includes(parte));
  for (const crudo of t.match(PALABRA) ?? []) {
    const token = crudo.replace(/[.\-/]+$/, '');
    if (!/\d/.test(token)) continue;
    // «1D/2D» puede venir como «1D y 2D»: cada parte se busca por separado.
    if (!vale(token) && !token.split('/').every(vale)) return `cifra ${token}`;
  }
  for (const marca of MARCAS) {
    if (new RegExp(`\\b${marca}\\b`).test(t) && !fuente.texto.includes(marca)) return `marca ${marca}`;
  }
  if (!fuente.conObra && INSTALACION.test(t)) return 'instalacion';
  if (!fuente.conCobertura && COBERTURA.test(t)) return 'cobertura';
  if (FUERA_DE_LUGAR.test(t)) return 'precio';
  const ajena = (palabra: string) => !fuente.texto.includes(palabra) && !(palabra === 'vigencia' && fuente.porTiempo);
  if ((t.match(DE_LA_POLIZA) ?? []).some(ajena)) return 'garantia';
  return null;
}

const limpiarLinea = (valor: unknown) =>
  String(valor ?? '')
    .replace(/^\s*[•·*-]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Deja solo lo que se puede sostener con las partidas. Una viñeta dudosa se va entera; de un párrafo
 * se va la frase. Lo que queda vacío lo completa quien llama, con el texto general.
 */
export function revisarRedaccion(
  salida: Partial<SalidaRedactar> | null | undefined,
  entrada: Pick<EntradaRedactar, 'partidas' | 'indicacion'>,
): Revision {
  const fuente = fuenteDe(entrada);
  const quitadas: string[] = [];
  const pasa = (frase: string) => {
    const motivo = motivoDeDuda(frase, fuente);
    if (motivo) quitadas.push(motivo);
    return !motivo;
  };
  const parrafo = (valor: unknown) =>
    limpiarLinea(valor)
      .split(/(?<=[.!?])\s+/)
      .filter((f) => f && pasa(f))
      .join(' ');
  const lista = (valor: unknown, max: number) =>
    (Array.isArray(valor) ? valor : [])
      .map(limpiarLinea)
      .filter((v) => v && pasa(v))
      .slice(0, max);

  const proyecto = limpiarLinea(salida?.proyecto);
  return {
    salida: {
      proyecto: proyecto.length <= MAX_PROYECTO && proyecto && pasa(proyecto) ? proyecto : '',
      intro: parrafo(salida?.intro),
      beneficios: lista(salida?.beneficios, MAX_BENEFICIOS),
      resultado: parrafo(salida?.resultado),
      puntos: (Array.isArray(salida?.puntos) ? salida.puntos : []).map((p) => ({
        texto: parrafo(p?.texto),
        vinetas: lista(p?.vinetas, MAX_VINETAS),
      })),
    },
    quitadas,
  };
}
