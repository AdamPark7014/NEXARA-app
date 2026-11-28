import { Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../prisma/prisma.service.js';
import { interpretarModoPiloto, leerModoPiloto } from '../../common/piloto/interruptor-piloto.js';
import {
  CLAVES_IA,
  CompuertaIa,
  IaNoDisponibleException,
  MODO_IA_POR_OMISION,
  clasificarFallo,
  tipoDeError,
  type ClaseFallo,
  type ClaveIa,
  type EventoCompuerta,
  type InstantaneaCompuerta,
  type ModoIa,
} from './compuerta-ia.js';

export { tipoDeError };

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
 * - Compuerta (`compuerta-ia.ts`): un corte de circuito en memoria. Tres fallos seguidos de llave, token, proyecto o
 *   presupuesto abren la «caída»; una sonda casi gratuita (`nexara-sonda`) la cierra cuando la puerta vuelve. Su
 *   interruptor es `ia.compuerta.modo` (sin fila = `observar`: cuenta y avisa, nunca bloquea).
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
  /** Fotos que acompañan el mensaje. Van antes del texto. */
  imagenes?: ReadonlyArray<{ mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string }>;
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

/** Proceso con el que la sonda de la compuerta aparece en el libro de la puerta (`x-proceso`). */
export const PROCESO_SONDA = 'nexara-sonda';
/** Cada cuántos minutos se sondea la puerta aunque nadie use la IA (`IA_SONDA_MINUTOS`). */
const SONDA_MINUTOS_POR_OMISION = 30;
/** De un mismo motivo se escribe a lo sumo un aviso por minuto en el log. */
const AVISO_CADA_MS = 60_000;

/** Modo de la compuerta sin base de datos (evals con tsx y pruebas): `IA_COMPUERTA_MODO`, y si falta, apagado. */
function modoDeEntorno(): ModoIa {
  return interpretarModoPiloto(process.env.IA_COMPUERTA_MODO) ?? 'apagado';
}

/** Sin fotos, el mensaje es texto y nada más: es lo que la caché de las demás funciones ya conoce. */
export function contenidoDelMensaje(peticion: Pick<PeticionBase, 'usuario' | 'imagenes'>): Anthropic.MessageParam['content'] {
  if (!peticion.imagenes?.length) return peticion.usuario;
  return [
    ...peticion.imagenes.map((i) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: i.mediaType, data: i.base64 },
    })),
    { type: 'text' as const, text: peticion.usuario },
  ];
}

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger('Claude');
  private cliente: Anthropic | null = null;
  private readonly llamadasPorDia = new Map<string, number>();

  /**
   * El corte de circuito (ver `compuerta-ia.ts`). Nace `apagado`: el modo real llega de `system_settings` cuando alguien
   * lo lee (`refrescarModo`). El constructor no abre timers ni toca la base: los evals hacen `new ClaudeService()`.
   */
  readonly compuerta = new CompuertaIa({ modo: 'apagado' });
  /** Última vez que se leyó el modo de la compuerta (para `disponible()`, que no puede esperar). */
  private modoLeidoAt = 0;
  private readonly avisos = new Map<string, { at: number; omitidos: number }>();

  /** `prisma` es opcional a propósito: sin él (evals con tsx, pruebas) el modo sale del entorno. */
  constructor(@Optional() private readonly prisma?: PrismaService) {
    this.compuerta.alCambiar((evento) => this.registrarCambio(evento));
  }

  /** Hay con qué llamar a la puerta: llave y, en producción, la URL de la puerta. No dice si la puerta responde. */
  configurada(): boolean {
    if (!(process.env.ANTHROPIC_API_KEY || '').trim()) return false;
    // En producción toda la IA pasa por la puerta: sin CLAUDE_BASE_URL `obtenerCliente` se niega a salir directo.
    return Boolean((process.env.CLAUDE_BASE_URL || '').trim()) || process.env.NODE_ENV !== 'production';
  }

  /**
   * ¿Se puede contar con la IA ahora? Falso sin configuración. Con la compuerta en `activo`, además falso mientras
   * está en caída. En `observar` y `apagado` solo mira la configuración (la compuerta cuenta pero no decide).
   */
  disponible(): boolean {
    if (!this.configurada()) return false;
    this.refrescarModoSinEsperar();
    if (this.compuerta.modo !== 'activo') return true;
    return this.compuerta.permite();
  }

  /**
   * Posición del interruptor `clave` de la IA (`ia.compuerta.modo`, `ia.topes.modo`, `ia.relleno_complejidad.modo`),
   * leída con el lector único del Piloto: sin fila = `observar`; fila mal escrita = `apagado`; caché de 30 s. Sin base
   * (evals, pruebas) solo la compuerta se puede encender, con `IA_COMPUERTA_MODO`; lo demás queda `apagado`.
   */
  async modoIa(clave: ClaveIa): Promise<ModoIa> {
    if (!this.prisma) return clave === CLAVES_IA.COMPUERTA ? modoDeEntorno() : 'apagado';
    return leerModoPiloto(this.prisma, clave, MODO_IA_POR_OMISION);
  }

  /** Lee el interruptor de la compuerta y se lo deja puesto a la compuerta. Nunca lanza. */
  private async refrescarModo(): Promise<ModoIa> {
    const modo = await this.modoIa(CLAVES_IA.COMPUERTA);
    this.compuerta.modo = modo;
    this.modoLeidoAt = Date.now();
    return modo;
  }

  /** Para `disponible()` (síncrono): con base, pide el modo atrás y se queda con el de la última lectura. */
  private refrescarModoSinEsperar(): void {
    if (!this.prisma) {
      this.compuerta.modo = modoDeEntorno();
      return;
    }
    if (Date.now() - this.modoLeidoAt < 30_000) return;
    this.modoLeidoAt = Date.now();
    void this.refrescarModo().catch(() => undefined);
  }

  private obtenerCliente(): Anthropic {
    if (!(process.env.ANTHROPIC_API_KEY || '').trim()) {
      throw new ServiceUnavailableException(
        'La IA no está configurada: falta ANTHROPIC_API_KEY en el entorno del servidor.',
      );
    }
    if (!this.cliente) {
      const base = (process.env.CLAUDE_BASE_URL || '').trim();
      // Regla de la empresa: en producción toda la IA pasa por la puerta (`ia.zynoratek.com` /
      // `puerta-ia:8080`), que lleva el tope de gasto. Sin CLAUDE_BASE_URL no se sale directo.
      if (!base && process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(
          'La IA no está configurada: falta CLAUDE_BASE_URL (la puerta) en el entorno del servidor.',
        );
      }
      this.cliente = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY!.trim(),
        // La puerta (o Anthropic directo si no hay CLAUDE_BASE_URL). Sin Authorization: la
        // puerta lee `x-api-key`, y un ANTHROPIC_AUTH_TOKEN viejo del entorno no debe colarse.
        baseURL: base || 'https://api.anthropic.com',
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
        `Se alcanzó el tope diario de ${tope} consultas a la IA para esta empresa: vuelve a intentarlo mañana.`,
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
    await this.refrescarModo();
    // El corte va ANTES de contar el cupo: una llamada que la compuerta niega no gasta nada.
    const paso = this.compuerta.pedirPaso();
    try {
      this.registrarLlamada(peticion.companyId);
    } catch (error) {
      // El cupo la frenó: la sonda que traía no se hizo, que no quede ocupada.
      if (paso.esSonda) this.compuerta.soltarSonda();
      throw error;
    }
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
          messages: [{ role: 'user', content: contenidoDelMensaje(peticion) }],
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
      const clase = clasificarFallo(error);
      this.compuerta.registrarFallo(clase, peticion.proceso, paso.esSonda, peticion.companyId);
      throw this.traducirFallo(error, clase, peticion.proceso, modelo);
    }
    this.compuerta.registrarBuena(peticion.proceso, modelo, peticion.companyId);

    const uso = usoDeRespuesta(modelo, respuesta.usage);
    this.logger.log(
      `[${peticion.proceso}] empresa ${peticion.companyId} · ${modelo} · ${uso.tokensEntrada}+${uso.tokensCacheLeidos} caché → ${uso.tokensSalida} tokens · ~$${uso.usdAprox ?? '?'}`,
    );

    if (respuesta.stop_reason === 'refusal') {
      throw new ServiceUnavailableException(
        'La IA no quiso procesar esa instrucción: reescríbela con otras palabras.',
      );
    }
    if (respuesta.stop_reason === 'max_tokens') {
      throw new ServiceUnavailableException(
        'El texto es demasiado largo para procesarlo de una vez: divídelo.',
      );
    }
    return { respuesta, uso };
  }

  /**
   * El error de la API → la excepción que ve quien llamó (los mismos textos de siempre) y, de paso, UN aviso en el log
   * por motivo y minuto en lugar de uno por llamada (en 32 h solo la complejidad dejó 97 ERROR y 97 WARN iguales).
   * Lo que no viene de la API se relanza tal cual. Solo el estado y el tipo: el mensaje puede repetir lo enviado.
   */
  private traducirFallo(error: unknown, clase: ClaseFallo, proceso: string, modelo: string): unknown {
    if (!(error instanceof Anthropic.APIError)) return error;
    switch (clase.motivo) {
      case 'llave_puerta_invalida':
      case 'token_nexara_invalido':
        this.avisarLimitado(clase.motivo, `[${proceso}] ANTHROPIC_API_KEY inválida (${clase.motivo}: ${clase.detalle})`);
        return new IaNoDisponibleException(
          'La clave de la IA no es válida: revisa ANTHROPIC_API_KEY en el servidor.',
          clase.motivo,
          clase.sinCosto,
        );
      case 'presupuesto_agotado':
        this.avisarLimitado(clase.motivo, `[${proceso}] presupuesto mensual de IA agotado en la puerta`);
        return new IaNoDisponibleException(
          'Se acabó el presupuesto de IA de este mes: avísale al administrador.',
          clase.motivo,
          clase.sinCosto,
        );
      case 'saturada':
        return new IaNoDisponibleException(
          'La IA está saturada en este momento: intenta de nuevo en un minuto.',
          clase.motivo,
          clase.sinCosto,
        );
      case 'modelo_no_permitido':
        // La puerta solo deja usar los modelos de la política de NEXARA.
        this.avisarLimitado(clase.motivo, `[${proceso}] la puerta no permite ${modelo}`);
        return new IaNoDisponibleException(
          `El modelo ${modelo} no está permitido para NEXARA en la puerta de IA.`,
          clase.motivo,
          clase.sinCosto,
        );
      default:
        this.avisarLimitado(clase.motivo, `[${proceso}] ${modelo} → ${clase.detalle} (${clase.motivo})`);
        return new IaNoDisponibleException('La IA no respondió: intenta de nuevo.', clase.motivo, clase.sinCosto);
    }
  }

  /** Escribe el aviso a lo sumo una vez por minuto por `clave`; los repetidos se cuentan y se suman al siguiente. */
  private avisarLimitado(clave: string, mensaje: string): void {
    const ahora = Date.now();
    const previo = this.avisos.get(clave);
    if (previo && ahora - previo.at < AVISO_CADA_MS) {
      previo.omitidos += 1;
      return;
    }
    this.avisos.set(clave, { at: ahora, omitidos: 0 });
    this.logger.warn(previo?.omitidos ? `${mensaje} (+${previo.omitidos} iguales desde el último aviso)` : mensaje);
  }

  /** Un solo renglón por cambio de estado de la compuerta, no uno por llamada. */
  private registrarCambio(evento: EventoCompuerta): void {
    if (evento.tipo === 'CAIDA') {
      const fallos = `${evento.fallos} ${evento.fallos === 1 ? 'fallo' : 'fallos'}`;
      const nota = this.compuerta.modo === 'observar' ? ' (modo observar: no bloquea)' : '';
      this.logger.error(
        `[Compuerta IA] CAIDA motivo=${evento.motivo} tras ${fallos}${evento.origen === 'sonda' ? ' de la sonda' : ''} · ${evento.detalle}${nota}`,
      );
    } else {
      const minutos = Math.max(0, Math.round((evento.hasta - evento.desde) / 60_000));
      this.logger.log(`[Compuerta IA] VOLVIO tras ${minutos} min`);
    }
  }

  /**
   * La sonda: una llamada mínima («ok», 16 tokens, sin razonamiento, ~$0.000002) para saber si la puerta y la llave
   * responden. Es la única prueba válida para todos los motivos de corte: `count_tokens` no sirve para el presupuesto
   * agotado, porque la puerta solo lo revisa en `/v1/messages`. NO pasa por `registrarLlamada`: no gasta cupo.
   * Le entrega el resultado a la compuerta (cierra o reabre la caída). Devuelve `true` si salió bien. Nunca lanza.
   */
  async sondear(): Promise<boolean> {
    if (!this.configurada()) return false;
    const modelo = MODELO_POR_OMISION;
    const thinking = configuracionPensamiento(modelo, false);
    try {
      await this.obtenerCliente().messages.create(
        {
          model: modelo,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'ok' }],
          ...(thinking ? { thinking } : {}),
          output_config: { effort: 'low' },
        },
        { timeout: 15_000, maxRetries: 0, headers: { 'x-proceso': PROCESO_SONDA } },
      );
      this.compuerta.registrarBuena(PROCESO_SONDA, modelo);
      return true;
    } catch (error) {
      const clase = clasificarFallo(error);
      this.compuerta.registrarFallo(clase, PROCESO_SONDA, true);
      this.avisarLimitado(`sonda:${clase.motivo}`, `[${PROCESO_SONDA}] ${modelo} → ${clase.detalle} (${clase.motivo})`);
      return false;
    }
  }

  /**
   * La vuelta periódica (la llama `GuardiaIaService` cada minuto). Sondea solo si el modo no es `apagado`, hay con qué
   * llamar y toca: en caída, al llegar `proximoIntento`; en `ok`, cada `IA_SONDA_MINUTOS` (30) para enterarse de una
   * llave muerta aunque nadie use la IA. Devuelve `true` si mandó una sonda.
   */
  async sondearSiToca(): Promise<boolean> {
    const modo = await this.refrescarModo();
    if (modo === 'apagado' || !this.configurada()) return false;
    const minutos = Number(process.env.IA_SONDA_MINUTOS);
    const intervaloMs = (Number.isFinite(minutos) && minutos >= 1 ? minutos : SONDA_MINUTOS_POR_OMISION) * 60_000;
    if (!this.compuerta.reservarSonda(intervaloMs)) return false;
    await this.sondear();
    return true;
  }

  /** El estado de la IA para el panel: la foto de la compuerta, el modo y si hay con qué llamar. */
  estadoIa(): InstantaneaCompuerta & { modo: ModoIa; configurada: boolean } {
    return { ...this.compuerta.instantanea(), modo: this.compuerta.modo, configurada: this.configurada() };
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
        'La IA respondió en un formato inesperado: intenta de nuevo.',
      );
    }
  }

  /** Una llamada de texto libre (Lab). */
  async texto(peticion: PeticionTexto): Promise<{ texto: string; uso: UsoClaude }> {
    const { respuesta, uso } = await this.llamar(peticion, null);
    return { texto: ClaudeService.texto(respuesta), uso };
  }
}
