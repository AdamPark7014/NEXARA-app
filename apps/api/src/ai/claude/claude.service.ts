import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Cliente único de Claude para los procesos automáticos de NEXARA (asistente de
 * actividades, actas de reunión, etc.).
 *
 * - La clave se lee SOLO de `ANTHROPIC_API_KEY` en el entorno del servidor. Nunca va en el
 *   repo, en la base ni en el navegador. Las llamadas van directo a api.anthropic.com
 *   (ignoran `ANTHROPIC_BASE_URL`); otra URL solo con `CLAUDE_BASE_URL`.
 * - Modelo barato por defecto (`claude-haiku-5-5`): clasificar y extraer datos no necesita
 *   un modelo grande. Cada proceso puede pedir otro con su propia variable de entorno.
 * - Salida estructurada (JSON Schema): la respuesta siempre trae los campos esperados.
 * - Tope diario de llamadas por empresa (`CLAUDE_TOPE_DIARIO`, 300 por omisión) para que
 *   un error o un abuso no dispare la factura. Vive en memoria: se reinicia con el proceso.
 */

export const MODELO_POR_OMISION = 'claude-haiku-5-5';

/** Dólares por millón de tokens (entrada, salida). Solo para estimar el gasto en el log. */
const PRECIOS_USD_POR_MTOK: Record<string, { entrada: number; salida: number }> = {
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5 },
  'claude-sonnet-5-5': { entrada: 2, salida: 10 },
  'claude-opus-5-5': { entrada: 4, salida: 20 },
};

export type UsoClaude = {
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
  tokensCacheLeidos: number;
  /** Estimación en dólares; null si el modelo no está en la tabla de precios. */
  usdAprox: number | null;
};

export type PeticionJson = {
  /** Nombre del proceso, para el log y el tope (p. ej. «asistente-actividades»). */
  proceso: string;
  companyId: number;
  /** Bloques de sistema estables primero: el último se marca para caché. */
  sistema: string[];
  usuario: string;
  esquema: Record<string, unknown>;
  modelo?: string;
  maxTokens?: number;
  /** Esfuerzo de razonamiento. `low` para clasificar; más alto para resumir textos largos. */
  esfuerzo?: 'low' | 'medium' | 'high';
  /** Tiempo máximo de la llamada (por omisión 60 s). */
  timeoutMs?: number;
};

export function estimarUsd(modelo: string, entrada: number, salida: number): number | null {
  const p = PRECIOS_USD_POR_MTOK[modelo];
  if (!p) return null;
  return Number(((entrada * p.entrada + salida * p.salida) / 1_000_000).toFixed(6));
}

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger('Claude');
  private cliente: Anthropic | null = null;
  private readonly llamadasPorDia = new Map<string, number>();

  disponible(): boolean {
    return Boolean((process.env.ANTHROPIC_API_KEY || '').trim());
  }

  private obtenerCliente(): Anthropic {
    if (!this.disponible()) {
      throw new ServiceUnavailableException(
        'La IA no está configurada: falta ANTHROPIC_API_KEY en el entorno del servidor.',
      );
    }
    if (!this.cliente) {
      this.cliente = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY!.trim(),
        // Directo a Anthropic. El SDK tomaría solo ANTHROPIC_BASE_URL/ANTHROPIC_AUTH_TOKEN del
        // entorno (el servidor los tiene para otro proveedor): ir por otro lado tiene que ser a
        // propósito, con CLAUDE_BASE_URL.
        baseURL: (process.env.CLAUDE_BASE_URL || '').trim() || 'https://api.anthropic.com',
        authToken: null,
        maxRetries: 2,
        timeout: 60_000,
      });
    }
    return this.cliente;
  }

  private registrarLlamada(companyId: number) {
    const tope = Math.max(1, Number(process.env.CLAUDE_TOPE_DIARIO) || 300);
    const dia = new Date().toISOString().slice(0, 10);
    const clave = `${companyId}:${dia}`;
    const usadas = this.llamadasPorDia.get(clave) ?? 0;
    if (usadas >= tope) {
      throw new ServiceUnavailableException(
        `Se alcanzó el tope diario de ${tope} consultas a la IA para esta empresa. Vuelve a intentarlo mañana.`,
      );
    }
    // Limpia los días anteriores para que el mapa no crezca.
    for (const k of this.llamadasPorDia.keys())
      if (!k.endsWith(`:${dia}`)) this.llamadasPorDia.delete(k);
    this.llamadasPorDia.set(clave, usadas + 1);
  }

  /** Una llamada con salida JSON validada por el esquema. Devuelve el objeto y el uso. */
  async json<T>(peticion: PeticionJson): Promise<{ datos: T; uso: UsoClaude }> {
    const cliente = this.obtenerCliente();
    this.registrarLlamada(peticion.companyId);
    const modelo = peticion.modelo || MODELO_POR_OMISION;
    const sistema: Anthropic.TextBlockParam[] = peticion.sistema.map((text, i) => ({
      type: 'text',
      text,
      ...(i === peticion.sistema.length - 1
        ? { cache_control: { type: 'ephemeral' as const } }
        : {}),
    }));

    let respuesta: Anthropic.Message;
    try {
      respuesta = await cliente.messages.create(
        {
          model: modelo,
          max_tokens: peticion.maxTokens ?? 4096,
          system: sistema,
          messages: [{ role: 'user', content: peticion.usuario }],
          output_config: {
            effort: peticion.esfuerzo ?? 'low',
            format: { type: 'json_schema', schema: peticion.esquema },
          },
        },
        { timeout: peticion.timeoutMs ?? 60_000 },
      );
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        this.logger.error(`[${peticion.proceso}] ANTHROPIC_API_KEY inválida`);
        throw new ServiceUnavailableException(
          'La clave de la IA no es válida. Revisa ANTHROPIC_API_KEY en el servidor.',
        );
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new ServiceUnavailableException(
          'La IA está saturada en este momento. Intenta de nuevo en un minuto.',
        );
      }
      if (error instanceof Anthropic.APIError) {
        this.logger.error(`[${peticion.proceso}] Anthropic ${error.status}: ${error.message}`);
        throw new ServiceUnavailableException('La IA no respondió. Intenta de nuevo.');
      }
      throw error;
    }

    const uso: UsoClaude = {
      modelo,
      tokensEntrada:
        respuesta.usage.input_tokens + (respuesta.usage.cache_creation_input_tokens ?? 0),
      tokensSalida: respuesta.usage.output_tokens,
      tokensCacheLeidos: respuesta.usage.cache_read_input_tokens ?? 0,
      usdAprox: null,
    };
    uso.usdAprox = estimarUsd(modelo, uso.tokensEntrada + uso.tokensCacheLeidos, uso.tokensSalida);
    this.logger.log(
      `[${peticion.proceso}] empresa ${peticion.companyId} · ${modelo} · ${uso.tokensEntrada}+${uso.tokensCacheLeidos} caché → ${uso.tokensSalida} tokens · ~$${uso.usdAprox ?? '?'}`,
    );

    if (respuesta.stop_reason === 'refusal') {
      throw new ServiceUnavailableException(
        'La IA no quiso procesar esa instrucción. Reescríbela con otras palabras.',
      );
    }
    if (respuesta.stop_reason === 'max_tokens') {
      throw new ServiceUnavailableException(
        'La instrucción es demasiado larga para procesarla de una vez. Divídela.',
      );
    }
    const texto = respuesta.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    try {
      return { datos: JSON.parse(texto) as T, uso };
    } catch {
      this.logger.error(`[${peticion.proceso}] respuesta no es JSON: ${texto.slice(0, 200)}`);
      throw new ServiceUnavailableException(
        'La IA respondió en un formato inesperado. Intenta de nuevo.',
      );
    }
  }
}
