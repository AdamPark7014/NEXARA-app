/**
 * 02 Alcance — subsecciones de la propuesta y sus plantillas por segmento.
 *
 * En la propuesta modelo el alcance son doce subsecciones numeradas, cada una con un título, uno o
 * más párrafos y, casi siempre, una lista de viñetas («Exclusiones del proyecto: • Trabajos de obra
 * civil. • …»). Se guardan en `Cotizacion.alcanceBloques` (JSON) con esta forma:
 *
 *   { clave, titulo, texto, vinetas: string[], parametros? }
 *
 * `clave` identifica de dónde salió el bloque (`paquete:camara-bala-instalada`, `plantilla:exclusiones`,
 * `libre-…`) para que un paquete o una plantilla no se dupliquen al volver a aplicarlos.
 *
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest.
 */
import { SEGMENTOS, ETIQUETA_SEGMENTO, normalizarSegmento, type Segmento } from './terminos-segmento.js';
import { plantillaObjetivo } from './objetivo-plantilla.js';

export type BloqueAlcance = {
  clave: string;
  titulo: string;
  texto: string | null;
  vinetas: string[];
  parametros?: Record<string, unknown> | null;
};

const MAX_BLOQUES = 60;
const MAX_VINETAS = 80;
const MAX_TITULO = 200;
const MAX_TEXTO = 12_000;
const MAX_VINETA = 1_000;

function texto(valor: unknown, max: number): string {
  if (valor == null) return '';
  return String(valor).replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function vinetasDe(valor: unknown): string[] {
  const crudas = Array.isArray(valor)
    ? valor
    : typeof valor === 'string'
      ? valor.split('\n')
      : [];
  return crudas
    .map((v) => texto(typeof v === 'object' && v && 'texto' in (v as object) ? (v as { texto: unknown }).texto : v, MAX_VINETA))
    // Quien pega viñetas desde Word o el PDF trae el «•» o el guion pegado al texto.
    .map((v) => v.replace(/^[•\-*]\s+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, MAX_VINETAS);
}

/**
 * Deja los bloques de alcance como los espera el PDF: título, párrafo y viñetas limpias.
 *
 * Acepta lo que ya hay guardado (bloques de paquete sin viñetas, bloques viejos sin clave) y quita
 * los que quedaron vacíos, que en el PDF saldrían como un «3.» sin nada.
 */
export function normalizarBloques(crudos: unknown): BloqueAlcance[] {
  if (!Array.isArray(crudos)) return [];
  const vistas = new Set<string>();
  const salida: BloqueAlcance[] = [];

  crudos.slice(0, MAX_BLOQUES).forEach((crudo, i) => {
    if (!crudo || typeof crudo !== 'object') return;
    const b = crudo as Record<string, unknown>;
    const titulo = texto(b['titulo'], MAX_TITULO);
    const cuerpo = texto(b['texto'], MAX_TEXTO);
    const vinetas = vinetasDe(b['vinetas']);
    if (!titulo && !cuerpo && !vinetas.length) return;

    let clave = texto(b['clave'], 80) || `libre-${i + 1}`;
    // Dos bloques con la misma clave se pisarían al reaplicar un paquete: el segundo se renombra.
    while (vistas.has(clave)) clave = `${clave}-${i + 1}`;
    vistas.add(clave);

    const parametros =
      b['parametros'] && typeof b['parametros'] === 'object' && !Array.isArray(b['parametros'])
        ? (b['parametros'] as Record<string, unknown>)
        : null;

    salida.push({
      clave,
      // Sin título el PDF lo imprime como párrafo suelto, sin número (no como «3. Alcance»).
      titulo,
      texto: cuerpo || null,
      vinetas,
      ...(parametros ? { parametros } : {}),
    });
  });

  return salida;
}

type PlantillaBloque = Omit<BloqueAlcance, 'parametros'>;

/*
 * Las doce subsecciones de la propuesta modelo, como punto de partida. Van sin cifras del proyecto
 * (cuántas cámaras, cuántos canales): esas las pone quien cotiza, porque una plantilla que dice
 * «14 cámaras» termina impresa en una propuesta de 9.
 */

const GRABACION: PlantillaBloque = {
  clave: 'plantilla:grabacion',
  titulo: 'Modernización del sistema de grabación',
  texto:
    'Se realizará la reubicación del área de monitoreo al sitio definido por el cliente, incluyendo el desmontaje del equipo existente y la instalación de un nuevo grabador con capacidad para integrar las cámaras existentes y las nuevas.\n\nLa capacidad del nuevo equipo permitirá disponer de canales libres para futuras ampliaciones, evitando inversiones adicionales en un nuevo equipo de grabación.',
  vinetas: [],
};

const MANTENIMIENTO: PlantillaBloque = {
  clave: 'plantilla:mantenimiento',
  titulo: 'Mantenimiento de la infraestructura existente',
  texto: 'Como parte del mantenimiento integral del sistema se realizarán las siguientes actividades:',
  vinetas: [
    'Recableado de las cámaras existentes.',
    'Sustitución de balunes de video.',
    'Reemplazo de conectores de video y alimentación.',
    'Revisión y adecuación del sistema de alimentación eléctrica de las cámaras.',
    'Retiro de la fuente de alimentación existente cuando no cumpla con las características técnicas requeridas.',
    'Suministro e instalación de fuentes de alimentación reguladas, garantizando una distribución adecuada de energía y una mayor estabilidad del sistema.',
  ],
};

const DIAGNOSTICO: PlantillaBloque = {
  clave: 'plantilla:diagnostico',
  titulo: 'Diagnóstico y recuperación de cámaras existentes',
  texto:
    'Como parte del alcance se realizará un diagnóstico completo de las cámaras que no presentan imagen. En caso de determinarse que alguna presenta una falla irreversible, se reemplazará por un modelo igual o por el de características técnicas más similares disponible al momento de la instalación, con el costo incluido en el presupuesto.\n\nEl diagnóstico verificará:',
  vinetas: ['Estado físico del equipo.', 'Alimentación eléctrica.', 'Cableado.', 'Transmisión de video.'],
};

const REUBICACION: PlantillaBloque = {
  clave: 'plantilla:reubicacion',
  titulo: 'Reubicación de cámaras existentes',
  texto:
    'Se contempla la reubicación de cámaras existentes con la finalidad de optimizar la cobertura del sistema y atender los puntos definidos durante el levantamiento técnico realizado en sitio.',
  vinetas: [],
};

const AMPLIACION: PlantillaBloque = {
  clave: 'plantilla:ampliacion',
  titulo: 'Ampliación del sistema de videovigilancia',
  texto:
    'La ubicación de cada equipo corresponde al diseño generado durante el levantamiento técnico, permitiendo cubrir las áreas identificadas como prioritarias por el cliente.\n\nSe suministrarán e instalarán cámaras nuevas, distribuidas de la siguiente manera:',
  vinetas: ['Cámaras tipo bala.', 'Cámaras tipo domo.'],
};

const POSTE: PlantillaBloque = {
  clave: 'plantilla:poste',
  titulo: 'Instalación de poste para vigilancia',
  texto:
    'Como parte del proyecto se contempla el suministro e instalación de un poste metálico destinado a soportar las cámaras del área indicada. El poste será instalado mediante anclaje sobre una base de concreto existente.\n\nEste alcance no contempla trabajos de obra civil para la construcción de la cimentación o base de concreto.',
  vinetas: [],
};

const ANALITICOS: PlantillaBloque = {
  clave: 'plantilla:analiticos',
  titulo: 'Configuración de analíticos de video',
  texto:
    'Se realizará la configuración del analítico inteligente de cruce de línea en las siguientes zonas. La configuración se ajustará a las condiciones físicas del sitio para optimizar la detección de eventos:',
  vinetas: ['Fachada principal.', 'Patio de maniobras.'],
};

const ALMACENAMIENTO: PlantillaBloque = {
  clave: 'plantilla:almacenamiento',
  titulo: 'Parámetros de almacenamiento',
  texto:
    'El sistema será configurado para proporcionar un tiempo de retención de grabaciones de aproximadamente 30 días, considerando la capacidad de almacenamiento instalada y los parámetros de configuración definidos durante la puesta en marcha.\n\nEl tiempo de almacenamiento podrá variar en función de factores como:',
  vinetas: [
    'Resolución de grabación.',
    'Cantidad de cámaras en operación.',
    'Velocidad de cuadros por segundo (FPS).',
    'Tipo de compresión utilizada.',
    'Grabación continua o por eventos.',
    'Cambios posteriores en la configuración del sistema.',
  ],
};

const INTEGRACION: PlantillaBloque = {
  clave: 'plantilla:integracion',
  titulo: 'Integración y puesta en marcha',
  texto: 'Al concluir la instalación se realizarán las siguientes actividades:',
  vinetas: [
    'Configuración de los equipos principales.',
    'Integración de todos los equipos existentes y nuevos.',
    'Verificación del funcionamiento de cada dispositivo.',
    'Pruebas generales de operación.',
    'Integración a la plataforma de monitoreo remoto del cliente, cuando aplique.',
  ],
};

const CONSIDERACIONES: PlantillaBloque = {
  clave: 'plantilla:consideraciones',
  titulo: 'Consideraciones de operación',
  texto:
    'La correcta operación remota del sistema dependerá directamente de la disponibilidad, estabilidad y ancho de banda del servicio de Internet proporcionado por el cliente.\n\nEl proveedor dejará configurado y en operación el acceso remoto; sin embargo, no será responsable por fallas derivadas de:',
  vinetas: [
    'Interrupciones del servicio de Internet.',
    'Bajo ancho de banda de subida (upload).',
    'Restricciones impuestas por el proveedor de servicios de Internet (ISP).',
    'Cambios en la infraestructura de red del cliente.',
    'Fallas en equipos de comunicación ajenos al alcance del presente proyecto.',
  ],
};

const EXCLUSIONES_BASE = [
  'Trabajos de obra civil.',
  'Canalizaciones adicionales no identificadas durante el levantamiento técnico.',
  'Adecuaciones eléctricas distintas a las descritas en este documento.',
  'Reparación o sustitución de equipos no contemplados en la presente propuesta.',
  'Ampliaciones posteriores al sistema.',
  'Servicios de Internet o incremento del ancho de banda contratado por el cliente.',
];

const EXCLUSIONES: Record<Segmento, PlantillaBloque> = {
  COMERCIAL: {
    clave: 'plantilla:exclusiones',
    titulo: 'Exclusiones del proyecto',
    texto: 'El presente alcance no considera, salvo indicación expresa en el presupuesto:',
    vinetas: [
      ...EXCLUSIONES_BASE,
      'Configuración de dispositivos móviles adicionales distintos a los definidos por el cliente durante la entrega del proyecto.',
    ],
  },
  OBRA: {
    clave: 'plantilla:exclusiones',
    titulo: 'Exclusiones de la obra',
    texto: 'El presente alcance no considera, salvo indicación expresa en el presupuesto:',
    vinetas: [
      ...EXCLUSIONES_BASE,
      'Permisos, licencias o trámites ante autoridades.',
      'Trabajos fuera del horario acordado con el cliente o en áreas sin acceso liberado.',
    ],
  },
  LICITACION: {
    clave: 'plantilla:exclusiones',
    titulo: 'Exclusiones',
    texto:
      'Quedan fuera del alcance los conceptos que no formen parte del catálogo de conceptos de las bases, en particular:',
    vinetas: [...EXCLUSIONES_BASE],
  },
  SERVICIO: {
    clave: 'plantilla:exclusiones',
    titulo: 'Exclusiones del servicio',
    texto: 'El presente servicio no considera, salvo indicación expresa en el presupuesto:',
    vinetas: [
      'Refacciones o equipos nuevos no listados en la cotización.',
      'Fallas ocasionadas por variaciones eléctricas, manipulación de terceros o condiciones ambientales.',
      'Trabajos de obra civil o canalizaciones nuevas.',
      'Servicios de Internet o incremento del ancho de banda contratado por el cliente.',
    ],
  },
};

const ENTREGA: Record<Segmento, PlantillaBloque> = {
  COMERCIAL: {
    clave: 'plantilla:entrega',
    titulo: 'Entrega del sistema',
    texto:
      'El proyecto se considerará concluido una vez realizadas las pruebas funcionales y verificado el correcto funcionamiento de:',
    vinetas: [
      'Todos los equipos existentes y de nueva instalación.',
      'El sistema de grabación o de control, según aplique.',
      'Las fuentes de alimentación.',
      'El acceso local al sistema.',
      'La integración remota, siempre que las condiciones de conectividad proporcionadas por el cliente lo permitan.',
    ],
  },
  OBRA: {
    clave: 'plantilla:entrega',
    titulo: 'Entrega de la obra',
    texto:
      'La obra se considerará concluida una vez realizadas las pruebas funcionales, entregada la documentación y verificado el correcto funcionamiento de:',
    vinetas: [
      'Todos los equipos instalados.',
      'Las canalizaciones y el cableado ejecutados.',
      'Las fuentes de alimentación y protecciones.',
      'La documentación de la obra: planos finales y memoria técnica.',
    ],
  },
  LICITACION: {
    clave: 'plantilla:entrega',
    titulo: 'Entrega y recepción',
    texto:
      'La entrega se formalizará con el acta de entrega-recepción que establezcan las bases, una vez verificado el funcionamiento de:',
    vinetas: [
      'Cada uno de los conceptos del catálogo contratado.',
      'Las pruebas que señalen las bases.',
      'La documentación técnica solicitada en el procedimiento.',
    ],
  },
  SERVICIO: {
    clave: 'plantilla:entrega',
    titulo: 'Entrega del servicio',
    texto:
      'El servicio se considerará concluido al entregar el reporte de lo atendido y verificar el funcionamiento de:',
    vinetas: [
      'Los equipos revisados y corregidos.',
      'La alimentación eléctrica y las conexiones intervenidas.',
      'El acceso local y remoto, cuando aplique.',
    ],
  },
};

/**
 * Plantillas de subsección que ofrece el editor para un segmento, en el orden del documento modelo:
 * las doce de la propuesta de CCTV. Exclusiones y entrega cambian con el segmento.
 */
export function plantillasDeAlcance(segmento: unknown): PlantillaBloque[] {
  const s = normalizarSegmento(segmento);
  return [
    GRABACION,
    MANTENIMIENTO,
    DIAGNOSTICO,
    REUBICACION,
    AMPLIACION,
    POSTE,
    ANALITICOS,
    INTEGRACION,
    ALMACENAMIENTO,
    CONSIDERACIONES,
    EXCLUSIONES[s],
    ENTREGA[s],
  ].map((b) => ({ ...b, vinetas: [...b.vinetas] }));
}

export type PlantillasDeSegmento = {
  segmento: Segmento;
  etiqueta: string;
  objetivo: { intro: string; cierre: string };
  bloques: PlantillaBloque[];
};

/** Todo lo que el editor ofrece como punto de partida, por segmento. */
export function plantillasDeCotizacion(): PlantillasDeSegmento[] {
  return SEGMENTOS.map((segmento) => ({
    segmento,
    etiqueta: ETIQUETA_SEGMENTO[segmento],
    objetivo: plantillaObjetivo(segmento),
    bloques: plantillasDeAlcance(segmento),
  }));
}
