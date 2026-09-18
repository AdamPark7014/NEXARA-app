/**
 * 01 Objetivo del proyecto — plantilla por segmento, **con las cifras de la cotización**.
 *
 * En la propuesta modelo los ocho beneficios están escritos a mano con los números del proyecto
 * («15 nuevas cámaras», «retención aproximada de 30 días»). Escribirlos a mano cada vez es lo que
 * hace que una propuesta diga 15 cámaras y cotice 14. Aquí los números salen de las partidas, así
 * que el objetivo y la tabla no pueden discrepar.
 *
 * Regla: **nunca se inventa un dato**. Un beneficio cuya cifra no existe no se imprime.
 *
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest.
 */
import { grupoDePartida, importeDePartida, type PartidaAgrupable } from './partidas-grupos.js';
import { ETIQUETA_SEGMENTO, normalizarSegmento, type Segmento } from './terminos-segmento.js';

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
  proyecto?: string | null;
  objetivoLibre?: string | null;
  /** Días de vigencia, si se conocen. */
  vigenciaDias?: number | null;
}): Objetivo {
  const segmento = normalizarSegmento(input.segmento);
  const cifras = cifrasDePartidas(input.partidas || []);
  const beneficios: string[] = [];

  if (cifras.piezasEquipo > 0) {
    beneficios.push(
      `Mayor cobertura con la incorporación de ${entero(cifras.piezasEquipo)} ${
        cifras.piezasEquipo === 1 ? 'equipo nuevo' : 'equipos nuevos'
      } en los puntos definidos durante el levantamiento técnico.`,
    );
  }
  for (const principal of cifras.principales) {
    if (principal.cantidad <= 0) continue;
    beneficios.push(`${entero(principal.cantidad)} × ${principal.nombre}.`);
  }
  if (cifras.serviciosManoObra > 0) {
    beneficios.push(
      `Instalación, configuración y puesta en marcha incluidas: ${entero(cifras.serviciosManoObra)} ${
        cifras.serviciosManoObra === 1 ? 'servicio' : 'servicios'
      } de mano de obra especializada.`,
    );
  }
  if (cifras.piezasMaterial > 0) {
    beneficios.push(
      `Material de instalación considerado en el presupuesto (${entero(cifras.piezasMaterial)} piezas), sin cargos posteriores por consumibles del alcance.`,
    );
  }
  if (cifras.importeEquipos > 0 && cifras.importeManoObra > 0) {
    beneficios.push('Presupuesto detallado partida por partida: cada equipo, material y servicio con su cantidad y su precio.');
  }
  if (segmento === 'LICITACION') {
    beneficios.push('Propuesta alineada al catálogo de conceptos y a las condiciones de las bases.');
  } else {
    beneficios.push('Entrega de un sistema probado y operativo, verificando el funcionamiento de cada equipo antes de su puesta en servicio.');
  }
  if (input.vigenciaDias && input.vigenciaDias > 0) {
    beneficios.push(`Precios firmes durante ${Math.round(input.vigenciaDias)} días naturales a partir de la emisión.`);
  }

  const proyecto = input.proyecto?.trim();
  const intro = input.objetivoLibre?.trim()
    ? input.objetivoLibre.trim()
    : proyecto
      ? `${INTRO[segmento]} Proyecto: ${proyecto} (${ETIQUETA_SEGMENTO[segmento]}).`
      : INTRO[segmento];

  return { intro, beneficios: beneficios.slice(0, 8), cierre: CIERRE[segmento] };
}
