/**
 * Los puntos que la cotización trae por omisión, los del diseño de NEXARA en Canva: justificación
 * tecnológica, beneficios, especificación funcional y centro de monitoreo. Salen en el índice de la
 * portada y como apartados del PDF mientras quien cotiza no escriba los suyos, y en el editor se
 * pueden renombrar, quitar o sustituir.
 *
 * El nombre y el texto siguen a lo que se cotiza: una venta de licencias no promete canalización ni
 * un centro de monitoreo. Regla de siempre: **nunca se inventa un dato**; las únicas cifras y modelos
 * que aparecen salen de las partidas.
 *
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest.
 */
import type { BloqueAlcance } from './alcance-bloques.js';
import { grupoDePartida, importeDePartida, type PartidaAgrupable } from './partidas-grupos.js';

export type PartidaDePunto = PartidaAgrupable & { model?: string | null };

/** Títulos de los apartados que no son bloques del alcance; cada cotización puede cambiarlos. */
export const TITULOS_POR_OMISION = {
  objetivo: 'Alcance ejecutivo',
  garantias: 'Póliza de garantías, exclusiones y vigencia comercial',
  cotizacion: 'Propuesta económica detallada',
} as const;

const MAX_EQUIPOS = 5;
const MAX_NOMBRE = 110;

const sinAcentos = (valor: unknown) =>
  String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Corta en una palabra completa: esto es un resumen, el nombre entero va en la tabla. */
function nombreCorto(nombre: string): string {
  // Algunos nombres traen la ficha completa con viñetas: aquí basta con lo que va antes de la primera.
  const limpio = nombre
    .split(/[•\n]/)[0]!
    .replace(/\s+/g, ' ')
    .replace(/[\s:;,.-]+$/, '')
    .trim();
  if (limpio.length <= MAX_NOMBRE) return limpio;
  return `${limpio.slice(0, MAX_NOMBRE).replace(/[\s/,;:.-]+\S*$/, '')}…`;
}

export function puntosPorOmision(partidas: PartidaDePunto[] | null | undefined): BloqueAlcance[] {
  const lista = partidas ?? [];
  const todo = lista.map((p) => `${sinAcentos(p.name)} ${sinAcentos(p.description)}`).join(' \n ');
  const hayCamaras = /\bcamaras?\b|\bdomos?\b|\bturret\b|\bcctv\b|videovigilancia/.test(todo);
  const hayCanalizacion = /canaliz|conduit|tuberia|charola|unicanal/.test(todo);
  const hayGrabacion = /\bnvr\b|\bdvr\b|grabador/.test(todo);
  const hayRespaldo = /\bups\b|no ?break/.test(todo);
  const soloLicencias = lista.length > 0 && lista.every((p) => /licen|suscrip/.test(`${sinAcentos(p.name)} ${sinAcentos(p.unit)}`));

  const equipos = lista
    .filter((p) => grupoDePartida(p) === 'EQUIPOS' && String(p.name ?? '').trim())
    .sort((a, b) => importeDePartida(b) - importeDePartida(a))
    .slice(0, MAX_EQUIPOS)
    .map((p) => {
      const modelo = String(p.model ?? '').trim();
      const nombre = nombreCorto(String(p.name));
      return modelo ? `${modelo}: ${nombre}` : nombre;
    });

  return [
    {
      clave: 'omision:justificacion',
      titulo: 'Justificación tecnológica',
      texto: soloLicencias
        ? 'El licenciamiento se definió a partir de las necesidades de la operación, con productos originales y respaldados por el fabricante.'
        : 'La solución se definió a partir de las necesidades del sitio y de su operación diaria, con equipos compatibles entre sí y respaldados por el fabricante.',
      vinetas: soloLicencias
        ? ['Cumplimiento: licenciamiento original del fabricante.', 'Soporte: acceso al soporte del fabricante durante su vigencia.']
        : [
            'Compatibilidad: los equipos propuestos trabajan en conjunto sin adaptaciones.',
            'Crecimiento: el sistema puede ampliarse sin reemplazar lo que ya está instalado.',
          ],
    },
    hayCanalizacion
      ? {
          clave: 'omision:beneficios',
          titulo: 'Beneficios de la canalización industrial',
          texto: 'La canalización protege el cableado y deja rutas definitivas para la operación del sitio.',
          vinetas: [
            'Protección: el cableado queda resguardado de golpes, humedad y manipulación.',
            'Orden: rutas claras que facilitan el mantenimiento y las ampliaciones.',
          ],
        }
      : {
          clave: 'omision:beneficios',
          titulo: 'Beneficios de la solución',
          texto: soloLicencias
            ? 'La propuesta da continuidad a la operación con licenciamiento vigente y el respaldo directo de NEXARA.'
            : 'La propuesta da continuidad a la operación con equipos de línea y el respaldo directo de NEXARA.',
          vinetas: [
            soloLicencias ? 'Continuidad: licencias vigentes y con soporte.' : 'Continuidad: menos interrupciones y equipos con soporte vigente.',
            'Respaldo: un solo responsable para dudas y garantías.',
          ],
        },
    {
      clave: 'omision:especificacion',
      titulo: soloLicencias
        ? 'Especificación funcional de las licencias seleccionadas'
        : hayCamaras
          ? 'Especificación funcional de las cámaras seleccionadas'
          : 'Especificación funcional de los equipos seleccionados',
      texto: !equipos.length
        ? 'Los equipos y servicios considerados se detallan en la propuesta económica.'
        : soloLicencias
          ? 'Estas son las licencias de la propuesta; el detalle completo está en la propuesta económica.'
          : 'Estos son los equipos principales de la propuesta; el detalle completo está en la propuesta económica.',
      vinetas: equipos,
    },
    hayGrabacion
      ? {
          clave: 'omision:monitoreo',
          titulo: hayRespaldo
            ? 'Centro de monitoreo, almacenamiento y respaldo eléctrico online'
            : 'Centro de monitoreo y almacenamiento',
          texto: hayRespaldo
            ? 'El centro de monitoreo concentra la grabación y la supervisión del sistema, con respaldo eléctrico para seguir operando durante un corte de energía.'
            : 'El centro de monitoreo concentra la grabación y la supervisión del sistema.',
          vinetas: [
            'Almacenamiento: grabación continua en el equipo considerado en la propuesta.',
            ...(hayRespaldo ? ['Respaldo eléctrico: UPS que protege la grabación ante cortes de energía.'] : []),
          ],
        }
      : {
          clave: 'omision:monitoreo',
          titulo: 'Operación y continuidad del servicio',
          texto: soloLicencias
            ? 'NEXARA da seguimiento a la entrega de las licencias y atiende las dudas de activación y uso.'
            : 'NEXARA da seguimiento a la entrega y atiende las dudas de uso durante la vigencia de la garantía.',
          vinetas: [],
        },
  ];
}
