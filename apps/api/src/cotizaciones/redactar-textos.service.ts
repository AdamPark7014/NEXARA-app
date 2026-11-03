import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { ClaudeService, type UsoClaude } from '../ai/claude/claude.service.js';
import { CONFIG_REDACTAR, peticionRedactar, revisarRedaccion, type PartidaParaRedactar, type SalidaRedactar } from '../ai/cotizar/redactar-ia.js';
import { puntosPorOmision } from './alcance-por-omision.js';
import { objetivoDePropuesta } from './objetivo-plantilla.js';
import { grupoDePartida } from './partidas-grupos.js';

export type BloqueRedactado = { clave: string; titulo: string; texto: string; vinetas: string[] };

export type RespuestaRedactar = {
  /** `general`: la IA no respondió y estos son los textos de siempre. */
  via: 'ia' | 'general';
  /** Título sugerido, o `null` si no hay uno seguro. */
  proyecto: string | null;
  objetivo: { intro: string; beneficios: string[]; cierre: string };
  bloques: BloqueRedactado[];
  /** Frases que la revisión del código quitó: se miden, no se enseñan. */
  quitadas: number;
  uso: UsoClaude | null;
};

/** El tercer punto no habla de equipos cuando no se cotiza ninguno. */
function titulosDe(partidas: PartidaParaRedactar[], omision: Array<{ titulo: string }>): string[] {
  const grupos = new Set(partidas.map(grupoDePartida));
  const titulos = omision.map((p) => p.titulo);
  if (!grupos.has('EQUIPOS') && !partidas.every((p) => /licen|suscrip/i.test(`${p.name ?? ''} ${p.unit ?? ''}`))) {
    titulos[2] = grupos.has('MATERIALES') ? 'Especificación de los materiales y servicios' : 'Especificación de los servicios';
  }
  return titulos;
}

/**
 * «Redactar con IA»: los textos de una cotización con las partidas que se le pasen, guardadas o no.
 * No crea ni guarda nada: el editor los pone en el documento y de ahí se guardan solos. Si la IA falla
 * responde con los textos generales, para que el botón siempre deje algo que ajustar.
 */
@Injectable()
export class RedactarTextosService {
  private readonly logger = new Logger(RedactarTextosService.name);

  constructor(private readonly claude: ClaudeService) {}

  async redactar(
    pedido: { partidas: PartidaParaRedactar[]; segmento?: string | null; indicacion?: string | null },
    companyId: number | null,
  ): Promise<RespuestaRedactar> {
    const tenantId = requireCompanyId(companyId);
    const partidas = pedido.partidas.filter((p) => String(p.name ?? '').trim());
    if (!partidas.length) throw new BadRequestException('Agrega al menos una partida para redactar.');

    const general = objetivoDePropuesta({ segmento: pedido.segmento, partidas });
    const omision = puntosPorOmision(partidas);
    const titulos = titulosDe(partidas, omision);

    let salida: SalidaRedactar | null = null;
    let quitadas = 0;
    let uso: UsoClaude | null = null;
    try {
      if (!this.claude.disponible()) throw new Error('IA no disponible');
      const r = await this.claude.json<SalidaRedactar>({
        ...peticionRedactar({ partidas, segmento: pedido.segmento, indicacion: pedido.indicacion, titulos }),
        proceso: 'cotizacion-redactar',
        companyId: tenantId,
        modelo: process.env.ANTHROPIC_REDACTAR_MODEL || CONFIG_REDACTAR.modelo,
      });
      const revisada = revisarRedaccion(r.datos, { partidas, indicacion: pedido.indicacion });
      salida = revisada.salida;
      quitadas = revisada.quitadas.length;
      uso = r.uso;
      if (quitadas) this.logger.log(`[cotizacion-redactar] la revisión quitó: ${revisada.quitadas.join(', ')}`);
    } catch (error) {
      this.logger.warn(`[cotizacion-redactar] sin IA, van los textos generales: ${error instanceof Error ? error.message : 'error'}`);
    }

    // Lo que la IA no dejó o la revisión quitó, parte por parte, lo cubre el texto general.
    return {
      via: salida ? 'ia' : 'general',
      proyecto: salida?.proyecto || null,
      objetivo: {
        intro: salida?.intro || general.intro,
        beneficios: salida?.beneficios.length ? salida.beneficios : general.beneficios,
        cierre: salida?.resultado || general.cierre,
      },
      bloques: omision.map((punto, i) => {
        const propio = salida?.puntos[i];
        const vacio = !propio?.texto && !propio?.vinetas.length;
        return {
          clave: punto.clave.replace(/^omision:/, salida ? 'ia:' : 'omision:'),
          titulo: titulos[i]!,
          texto: vacio ? (punto.texto ?? '') : propio!.texto,
          vinetas: vacio ? punto.vinetas : propio!.vinetas,
        };
      }),
      quitadas,
      uso,
    };
  }
}
