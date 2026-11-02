/**
 * Alcance ejecutivo — plantilla por segmento, **con las cifras de la cotización**.
 *
 * Escribir los beneficios a mano cada vez es lo que hace que una propuesta diga 15 cámaras y cotice
 * 14. Aquí los números salen de las partidas, así que el texto y la tabla no pueden discrepar.
 *
 * Reglas: **nunca se inventa un dato** (un beneficio cuya cifra no existe no se imprime) y **tres
 * puntos como máximo**. Lo que ya dice la tabla (cada equipo, su precio, la vigencia) no se repite
 * aquí: Adam pidió que sea conciso, con ocho puntos se revolvía.
 *
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest.
 */
import { grupoDePartida, importeDePartida, type PartidaAgrupable } from './partidas-grupos.js';
import { normalizarSegmento, type Segmento } from './terminos-segmento.js';

export type CifrasPropuesta = {
  /** Piezas de equipo (suma de cantidades del grupo Equipos). */
  piezasEquipo: number;
  /** Conceptos distintos de equipo. */
  conceptosEquipo: number;
  /** Piezas de material. */
  piezasMaterial: number;
  /** Servicios de mano de obra (suma de cantidades). */
  serviciosManoObra: number;
  importeEquipos: number;
  importeMateriales: number;
  importeManoObra: number;
  /** Conceptos con más peso, para nombrarlos en el objetivo. */
  principales: Array<{ nombre: string; cantidad: number }>;
};

/** Cifras reales de la cotización, no estimaciones. */
export function cifrasDePartidas(partidas: PartidaAgrupable[]): CifrasPropuesta {
  const cifras: CifrasPropuesta = {
    piezasEquipo: 0,
    conceptosEquipo: 0,
    piezasMaterial: 0,
    serviciosManoObra: 0,
    importeEquipos: 0,
    importeMateriales: 0,
    importeManoObra: 0,
    principales: [],
  };

  for (const partida of partidas || []) {
    const cantidad = Math.max(0, Number(partida.qty) || 0);
    const importe = importeDePartida(partida);
    switch (grupoDePartida(partida)) {
      case 'EQUIPOS':
        cifras.piezasEquipo += cantidad;
        cifras.conceptosEquipo += 1;
        cifras.importeEquipos += importe;
        break;
      case 'MATERIALES':
        cifras.piezasMaterial += cantidad;
        cifras.importeMateriales += importe;
        break;
      default:
        cifras.serviciosManoObra += cantidad;
        cifras.importeManoObra += importe;
        break;
    }
  }

  cifras.principales = [...(partidas || [])]
    .filter((p) => grupoDePartida(p) === 'EQUIPOS')
    .sort((a, b) => importeDePartida(b) - importeDePartida(a))
    .slice(0, 3)
    .map((p) => ({ nombre: String(p.name ?? '').trim(), cantidad: Math.max(0, Number(p.qty) || 0) }))
    .filter((p) => p.nombre.length > 0);

  return cifras;
}

export type Objetivo = {
  intro: string;
  beneficios: string[];
  cierre: string;
};

/**
 * Cómo se guarda el objetivo que escribe quien cotiza (`Cotizacion.objetivo`, texto).
 *
 * Texto legible en cualquier lado (apps, correo, base), no JSON:
 *
 *   Este proyecto permitirá contar con…      ← introducción (uno o más párrafos)
 *
 *   Beneficios:
 *   1. Mayor cobertura de vigilancia…         ← un beneficio por línea, numerado
 *   2. Recuperación y modernización…
 *
 *   Cierre:
 *   Como resultado, el cliente dispondrá…     ← párrafo de cierre
 *
 * Las marcas «Beneficios:» y «Cierre:» son las que permiten guardar un cierre sin beneficios sin
 * que se confunda con la introducción. Un texto sin marcas (lo que se guardaba antes, o lo que
 * escriba el CRM viejo) se sigue leyendo: todo es introducción, salvo una lista numerada, que son
 * los beneficios, y lo que venga después de ella, que es el cierre.
 */
const MARCA_BENEFICIOS = /^\s*beneficios\s*:?\s*$/i;
const MARCA_CIERRE = /^\s*(cierre|conclusi[oó]n)\s*:?\s*$/i;
/** La frase la imprime el PDF; si alguien la pega del documento modelo no debe salir dos veces. */
const FRASE_BENEFICIOS = /^\s*entre los principales beneficios se encuentran\s*:?\s*$/i;
const ITEM_LISTA = /^\s*(?:\d{1,2}\s*[.)-]|[-•*])\s+(.*\S)\s*$/;

function unirParrafos(lineas: string[]): string {
  return lineas
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Separa el objetivo guardado en introducción, beneficios y cierre. */
export function leerObjetivo(texto: string | null | undefined): Objetivo {
  const lineas = String(texto ?? '').replace(/\r\n?/g, '\n').split('\n');
  const intro: string[] = [];
  const beneficios: string[] = [];
  const cierre: string[] = [];
  let fase: 'intro' | 'beneficios' | 'cierre' = 'intro';
  let huboBlanco = false;

  for (const linea of lineas) {
    if (MARCA_CIERRE.test(linea)) {
      fase = 'cierre';
      continue;
    }
    if (fase !== 'cierre' && (MARCA_BENEFICIOS.test(linea) || FRASE_BENEFICIOS.test(linea))) {
      fase = 'beneficios';
      huboBlanco = false;
      continue;
    }

    if (fase === 'cierre') {
      cierre.push(linea);
      continue;
    }

    const item = linea.match(ITEM_LISTA);
    if (fase === 'intro') {
      if (item && /^\s*\d/.test(linea)) {
        fase = 'beneficios';
        beneficios.push(item[1]!.trim());
        huboBlanco = false;
      } else {
        intro.push(linea);
      }
      continue;
    }

    // fase === 'beneficios'
    if (item) {
      beneficios.push(item[1]!.trim());
      huboBlanco = false;
    } else if (!linea.trim()) {
      huboBlanco = true;
    } else if (huboBlanco || !beneficios.length) {
      // Texto suelto después de la lista (y de un renglón en blanco): es el cierre.
      fase = 'cierre';
      cierre.push(linea);
    } else {
      // Renglón que continúa el beneficio anterior.
      beneficios[beneficios.length - 1] = `${beneficios[beneficios.length - 1]} ${linea.trim()}`;
    }
  }

  return {
    intro: unirParrafos(intro),
    beneficios: beneficios.map((b) => b.replace(/\s+/g, ' ').trim()).filter(Boolean),
    cierre: unirParrafos(cierre),
  };
}

/** Lo contrario de `leerObjetivo`: el texto que se guarda en `Cotizacion.objetivo`. */
export function escribirObjetivo(partes: Partial<Objetivo>): string {
  const intro = unirParrafos([String(partes.intro ?? '')]);
  const beneficios = (partes.beneficios ?? [])
    .map((b) => String(b ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const cierre = unirParrafos([String(partes.cierre ?? '')]);

  const bloques: string[] = [];
  if (intro) bloques.push(intro);
  if (beneficios.length) bloques.push(['Beneficios:', ...beneficios.map((b, i) => `${i + 1}. ${b}`)].join('\n'));
  if (cierre) bloques.push(`Cierre:\n${cierre}`);
  return bloques.join('\n\n');
}

const INTRO: Record<Segmento, string> = {
  COMERCIAL:
    'Este proyecto permitirá contar con una solución tecnológica confiable, moderna y preparada para las necesidades actuales y futuras de la operación.',
  OBRA: 'Esta obra deja instalada una infraestructura completa, probada y lista para operar, ejecutada bajo normas y con la documentación que la respalda.',
  LICITACION:
    'La presente propuesta responde a los requisitos técnicos del procedimiento de contratación y detalla el alcance con el que se atendería el servicio.',
  SERVICIO:
    'Este servicio devuelve el sistema a condiciones de operación confiables y documenta lo que se encontró, lo que se corrigió y lo que queda recomendado.',
};

const CIERRE: Record<Segmento, string> = {
  COMERCIAL:
    'Como resultado, el cliente dispondrá de una solución con mayor cobertura, mejor desempeño y capacidad de crecimiento, reduciendo riesgos operativos.',
  OBRA: 'Como resultado, la obra se entrega probada y en operación, con la evidencia del trabajo realizado en sitio.',
  LICITACION:
    'El alcance, las condiciones y los tiempos aquí descritos se ajustan a lo señalado en las bases del procedimiento.',
  SERVICIO:
    'Al cierre del servicio el sistema queda verificado punto por punto, con el reporte de lo atendido y las recomendaciones para conservarlo estable.',
};

const entero = (n: number) => Math.round(n).toLocaleString('es-MX');

/**
 * Objetivo listo para imprimir.
 *
 * `objetivoLibre` (lo que escribió quien cotiza) manda sobre la plantilla: la plantilla es el punto
 * de partida, no una camisa de fuerza.
 */
export function objetivoDePropuesta(input: {
  segmento: unknown;
  partidas: PartidaAgrupable[];
  /** Ya no se imprimen aquí: el proyecto va arriba de la primera hoja y la vigencia en las condiciones. */
  proyecto?: string | null;
  vigenciaDias?: number | null;
  objetivoLibre?: string | null;
}): Objetivo {
  const segmento = normalizarSegmento(input.segmento);
  const cifras = cifrasDePartidas(input.partidas || []);
  const beneficios: string[] = [];

  // Una venta de licencias no lleva «equipos nuevos» ni levantamiento técnico.
  const partidas = input.partidas || [];
  const soloLicencias = partidas.length > 0 && partidas.every((p) => /licen|suscrip/i.test(`${p.name ?? ''} ${p.unit ?? ''}`));
  if (soloLicencias) {
    const licencias = partidas.reduce((acc, p) => acc + Math.max(0, Number(p.qty) || 0), 0);
    beneficios.push(`Licenciamiento: ${entero(licencias)} ${licencias === 1 ? 'licencia' : 'licencias'}, de acuerdo con lo solicitado.`);
    beneficios.push('Entrega: licenciamiento original, con el soporte del fabricante.');
  } else if (cifras.piezasEquipo > 0) {
    beneficios.push(
      `Equipamiento: ${entero(cifras.piezasEquipo)} ${
        cifras.piezasEquipo === 1 ? 'equipo nuevo' : 'equipos nuevos'
      } en los puntos definidos durante el levantamiento técnico.`,
    );
  }
  if (segmento === 'LICITACION') {
    beneficios.push('Cumplimiento: propuesta alineada al catálogo de conceptos y a las condiciones de las bases.');
  } else if (soloLicencias) {
    // Ya están dichos arriba.
  } else if (segmento === 'SERVICIO') {
    beneficios.push('Servicio especializado: personal técnico propio, con reporte de lo atendido.');
    beneficios.push('Entrega: sistema verificado punto por punto al cierre del servicio.');
  } else if (cifras.serviciosManoObra > 0) {
    beneficios.push('Instalación incluida: configuración y puesta en marcha a cargo de personal especializado.');
    beneficios.push('Entrega: sistema probado y operativo, verificando cada equipo antes de su puesta en servicio.');
  } else if (cifras.piezasEquipo > 0) {
    beneficios.push('Suministro: equipos nuevos de línea, listos para su integración.');
  }

  // Lo que escribió quien cotiza manda, parte por parte: si dejó vacíos los beneficios, salen de las
  // partidas; si dejó vacío el cierre, va el del segmento.
  const escrito = leerObjetivo(input.objetivoLibre);

  return {
    intro: escrito.intro || INTRO[segmento],
    beneficios: escrito.beneficios.length ? escrito.beneficios.slice(0, 20) : beneficios.slice(0, 3),
    cierre: escrito.cierre || CIERRE[segmento],
  };
}

/** Texto de partida del objetivo para un segmento (lo que ofrece el editor como plantilla). */
export function plantillaObjetivo(segmento: unknown): { intro: string; cierre: string } {
  const s = normalizarSegmento(segmento);
  return { intro: INTRO[s], cierre: CIERRE[s] };
}
