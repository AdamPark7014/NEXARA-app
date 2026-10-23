import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Cliente único de Claude para los procesos automáticos de NEXARA (asistente de
 * actividades, actas de reunión, triage, Lab).
 *
 * - Todo pasa por la puerta única de IA de Adam (`C:\dev\scripts\ai-os\IA-CLAUDE.md`):
 *   `CLAUDE_BASE_URL` = la puerta (`http://puerta-ia:8080` entre contenedores del Hetzner) y
 *   `ANTHROPIC_API_KEY` = el token de NEXARA en la puerta, no la llave de Anthropic. Sin
 *   `CLAUDE_BASE_URL` va directo a api.anthropic.com (solo para evals locales). Nunca va en el
 *   repo, en la base ni en el navegador.
 * - Modelo barato por defecto (`claude-haiku-5-5`): el eval (`src/ai/eval/`) decide cada
 *   proceso. Cada proceso puede pedir otro con su propia variable de entorno.
 * - Salida estructurada (JSON Schema): la respuesta siempre trae los campos esperados.
 * - Tope diario de llamadas por empresa (`CLAUDE_TOPE_DIARIO`, 300 por omisión) para que
 *   un error o un abuso no dispare la factura. Vive en memoria: se reinicia con el proceso. La
 *   puerta además corta al llegar al presupuesto mensual del proyecto.
 */

export const MODELO_POR_OMISION = 'claude-haiku-5-5';

/** Dólares por millón de tokens (entrada, salida). Solo para estimar el gasto en el log. */
const PRECIOS_USD_POR_MTOK: Record<string, { entrada: number; salida: number }> = {
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5 },
  'claude-sonnet-5-5': { entrada: 2, salida: 10 },
  'claude-opus-5-5': { entrada: 4, salida: 20 },
};
/** Escribir en la caché (5 min) cuesta 1.25× la entrada; leerla, 0.1×. */
const FACTOR_CACHE_ESCRITA = 1.25;
const FACTOR_CACHE_LEIDA = 0.1;

export type UsoClaude = {
  modelo: string;
  /** Entrada a precio completo + la escrita en caché (lo que no salió de la caché). */
  tokensEntrada: number;
  tokensSalida: number;
  tokensCacheLeidos: number;
  tokensCacheEscritos: number;
  /** Parte de la salida que fue razonamiento (ya incluida en `tokensSalida`). */
  tokensPensamiento: number;
  /** Estimación en dólares; null si el modelo no está en la tabla de precios. */
  usdAprox: number | null;
};

type PeticionBase = {
  /**
   * Nombre del proceso, para el log, el tope y el encabezado `x-proceso` de la puerta (p. ej.
   * «asistente-actividades»). Usa minúsculas, dígitos y guiones: así sale igual en el panel de la puerta.
   */
  proceso: string;
  companyId: number;
  /** Bloques de sistema estables primero: cada uno se marca para caché (máx. 3). */
  sistema: string[];
  usuario: string;
  modelo?: string;
  maxTokens?: number;
  /** Esfuerzo de razonamiento. `low` para clasificar y extraer. */
  esfuerzo?: 'low' | 'medium' | 'high';
  /**
   * Razonamiento adaptativo (por omisión). `false` lo apaga cuando el eval demuestra que no
   * hace falta: en Sonnet 5.5 se manda `between_tools`, que es su forma de apagarlo.
   */
  pensar?: boolean;
  /** Tiempo máximo de la llamada (por omisión 60 s). */
  timeoutMs?: number;
  /** Reintentos si falla o se pasa del tiempo (por omisión 2, los del cliente). */
  reintentos?: number;
};

export type PeticionJson = PeticionBase & {
  esquema: Record<string, unknown>;
};

export type PeticionTexto = PeticionBase;

/** Precio de una llamada a partir del `usage` de la respuesta. */
export function estimarUsd(
  modelo: string,
  uso: { entrada: number; salida: number; cacheLeida?: number; cacheEscrita?: number },
): number | null {
  const p = PRECIOS_USD_POR_MTOK[modelo];
  if (!p) return null;
  const entrada =
    uso.entrada * p.entrada +
    (uso.cacheEscrita ?? 0) * p.entrada * FACTOR_CACHE_ESCRITA +
    (uso.cacheLeida ?? 0) * p.entrada * FACTOR_CACHE_LEIDA;
  return Number(((entrada + uso.salida * p.salida) / 1_000_000).toFixed(6));
}

/** `usage` de la API → uso con costo. */
export function usoDeRespuesta(modelo: string, usage: Anthropic.Usage): UsoClaude {
  const cacheEscrita = usage.cache_creation_input_tokens ?? 0;
  const cacheLeida = usage.cache_read_input_tokens ?? 0;
  return {
    modelo,
    tokensEntrada: usage.input_tokens + cacheEscrita,
    tokensSalida: usage.output_tokens,
    tokensCacheLeidos: cacheLeida,
    tokensCacheEscritos: cacheEscrita,
    tokensPensamiento: usage.output_tokens_details?.thinking_tokens ?? 0,
    usdAprox: estimarUsd(modelo, {
      entrada: usage.input_tokens,
      salida: usage.output_tokens,
      cacheLeida,
      cacheEscrita,
    }),
  };
}

/** Configuración de razonamiento para el modelo. Omitirla = adaptativo. */
export function configuracionPensamiento(
  modelo: string,
  pensar: boolean | undefined,
): Anthropic.ThinkingConfigParam | undefined {
  if (pensar !== false) return undefined;
  return modelo.startsWith('claude-sonnet-5-5') ? { type: 'between_tools' } : { type: 'disabled' };
}

/**
 * Valor del encabezado `x-proceso` que la puerta usa para medir cada función por separado (latencia, errores,
 * cortes y costo en su panel). La puerta acepta `[a-z0-9-]`, máx. 40, y no lo reenvía a Anthropic.
 */
export function procesoParaPuerta(proceso: string): string {
  const limpio = (proceso || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return limpio || 'sin-proceso';
}

/** Tipo de error que manda la puerta (o Anthropic) en el cuerpo: `budget_exceeded`, etc. */
function tipoDeError(error: InstanceType<typeof Anthropic.APIError>): string | null {
  const cuerpo = error.error as { error?: { type?: unknown } } | undefined;
  return typeof cuerpo?.error?.type === 'string' ? cuerpo.error.type : null;
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
        // La puerta (o Anthropic directo si no hay CLAUDE_BASE_URL). Sin Authorization: la
        // puerta lee `x-api-key`, y un ANTHROPIC_AUTH_TOKEN viejo del entorno no debe colarse.
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

  /** Llamada común: sistema estable con caché, mensaje variable, errores en español. */
  private async llamar(
    peticion: PeticionBase,
    formato: Anthropic.JSONOutputFormat | null,
  ): Promise<{ respuesta: Anthropic.Message; uso: UsoClaude }> {
    const cliente = this.obtenerCliente();
    this.registrarLlamada(peticion.companyId);
    const modelo = peticion.modelo || MODELO_POR_OMISION;
    // Cada bloque estable lleva su marca de caché (la API admite 4; aquí van 3 como máximo):
    // el prompt fijo se reutiliza aunque cambie la lista de personas de quien pregunta.
    const sistema: Anthropic.TextBlockParam[] = peticion.sistema
      .filter((t) => t.trim())
      .map((text, i, todos) => ({
        type: 'text',
        text,
        ...(i >= todos.length - 3 ? { cache_control: { type: 'ephemeral' as const } } : {}),
      }));
    const thinking = configuracionPensamiento(modelo, peticion.pensar);

    let respuesta: Anthropic.Message;
    try {
      respuesta = await cliente.messages.create(
        {
          model: modelo,
          max_tokens: peticion.maxTokens ?? 4096,
          ...(sistema.length ? { system: sistema } : {}),
          messages: [{ role: 'user', content: peticion.usuario }],
          ...(thinking ? { thinking } : {}),
          output_config: {
            effort: peticion.esfuerzo ?? 'low',
            ...(formato ? { format: formato } : {}),
          },
        },
        {
          timeout: peticion.timeoutMs ?? 60_000,
          ...(peticion.reintentos != null ? { maxRetries: peticion.reintentos } : {}),
          // La puerta registra la llamada bajo este proceso (no viaja a Anthropic).
          headers: { 'x-proceso': procesoParaPuerta(peticion.proceso) },
        },
      );
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        this.logger.error(`[${peticion.proceso}] ANTHROPIC_API_KEY inválida`);
        throw new ServiceUnavailableException(
          'La clave de la IA no es válida. Revisa ANTHROPIC_API_KEY en el servidor.',
        );
      }
      if (error instanceof Anthropic.RateLimitError) {
        if (tipoDeError(error) === 'budget_exceeded') {
          this.logger.error(`[${peticion.proceso}] presupuesto mensual de IA agotado en la puerta`);
          throw new ServiceUnavailableException(
            'Se acabó el presupuesto de IA de este mes. Avísale al administrador.',
          );
        }
        throw new ServiceUnavailableException(
          'La IA está saturada en este momento. Intenta de nuevo en un minuto.',
        );
      }
      if (error instanceof Anthropic.BadRequestError && /no está permitido/.test(error.message)) {
        // La puerta solo deja usar los modelos de la política de NEXARA.
        this.logger.error(`[${peticion.proceso}] la puerta no permite ${modelo}`);
        throw new ServiceUnavailableException(`El modelo ${modelo} no está permitido para NEXARA en la puerta de IA.`);
      }
      if (error instanceof Anthropic.APIError) {
        // Solo el estado y el tipo: el mensaje puede repetir parte de lo enviado.
        this.logger.error(
          `[${peticion.proceso}] ${modelo} → ${error.status ?? 'sin estado'} ${tipoDeError(error) ?? ''}`.trim(),
        );
        throw new ServiceUnavailableException('La IA no respondió. Intenta de nuevo.');
      }
      throw error;
    }

    const uso = usoDeRespuesta(modelo, respuesta.usage);
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
        'El texto es demasiado largo para procesarlo de una vez. Divídelo.',
      );
    }
    return { respuesta, uso };
  }

  private static texto(respuesta: Anthropic.Message): string {
    return respuesta.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
  }

  /** Una llamada con salida JSON validada por el esquema. Devuelve el objeto y el uso. */
  async json<T>(peticion: PeticionJson): Promise<{ datos: T; uso: UsoClaude }> {
    const { respuesta, uso } = await this.llamar(peticion, {
      type: 'json_schema',
      schema: peticion.esquema,
    });
    const texto = ClaudeService.texto(respuesta);
    try {
      return { datos: JSON.parse(texto) as T, uso };
    } catch {
      // Sin el contenido en el log: puede traer nombres o datos de la empresa.
      this.logger.error(`[${peticion.proceso}] respuesta no es JSON (${texto.length} caracteres)`);
      throw new ServiceUnavailableException(
        'La IA respondió en un formato inesperado. Intenta de nuevo.',
      );
    }
  }

  /** Una llamada de texto libre (Lab). */
  async texto(peticion: PeticionTexto): Promise<{ texto: string; uso: UsoClaude }> {
    const { respuesta, uso } = await this.llamar(peticion, null);
    return { texto: ClaudeService.texto(respuesta), uso };
  }
}
