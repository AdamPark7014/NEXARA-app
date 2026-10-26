import Anthropic from '@anthropic-ai/sdk';
import { ClaudeService, configuracionPensamiento, estimarUsd, procesoParaPuerta, usoDeRespuesta } from './claude.service.js';

function respuesta(texto: string, extra: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: texto, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 120,
      output_tokens: 250,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 2900,
    },
    ...extra,
  } as unknown as Anthropic.Message;
}

function conCliente(create: jest.Mock): ClaudeService {
  process.env.ANTHROPIC_API_KEY = 'pia_prueba_x';
  const svc = new ClaudeService();
  (svc as any).cliente = { messages: { create } };
  return svc;
}

describe('ClaudeService', () => {
  const llave = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = llave;
  });

  it('apaga el razonamiento con la forma de cada modelo', () => {
    expect(configuracionPensamiento('claude-haiku-5-5', false)).toEqual({ type: 'disabled' });
    expect(configuracionPensamiento('claude-sonnet-5-5', false)).toEqual({ type: 'between_tools' });
    expect(configuracionPensamiento('claude-haiku-5-5', true)).toBeUndefined();
    expect(configuracionPensamiento('claude-haiku-5-5', undefined)).toBeUndefined();
  });

  it('el costo cuenta la caché leída a 0.1× y la escrita a 1.25×', () => {
    expect(estimarUsd('claude-haiku-5-5', { entrada: 1_000_000, salida: 0 })).toBe(0.1);
    expect(estimarUsd('claude-haiku-5-5', { entrada: 0, salida: 0, cacheLeida: 1_000_000 })).toBe(0.01);
    expect(estimarUsd('claude-haiku-5-5', { entrada: 0, salida: 0, cacheEscrita: 1_000_000 })).toBe(0.125);
    expect(estimarUsd('otro-modelo', { entrada: 1, salida: 1 })).toBeNull();
    const uso = usoDeRespuesta('claude-haiku-5-5', respuesta('{}').usage);
    expect(uso).toMatchObject({ tokensEntrada: 120, tokensCacheLeidos: 2900, tokensSalida: 250, usdAprox: 0.000166 });
  });

  it('manda sistema estable con caché, esfuerzo, razonamiento y esquema', async () => {
    const create = jest.fn().mockResolvedValue(respuesta('{"ok":true}'));
    const svc = conCliente(create);
    const { datos } = await svc.json<{ ok: boolean }>({
      proceso: 'prueba',
      companyId: 1,
      sistema: ['fijo', 'personas'],
      usuario: 'hola',
      esquema: { type: 'object' },
      modelo: 'claude-haiku-5-5',
      pensar: false,
      maxTokens: 300,
    });
    expect(datos).toEqual({ ok: true });
    const cuerpo = create.mock.calls[0][0];
    expect(cuerpo.system).toEqual([
      { type: 'text', text: 'fijo', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'personas', cache_control: { type: 'ephemeral' } },
    ]);
    expect(cuerpo).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 300,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object' } } },
    });
    expect(cuerpo).not.toHaveProperty('temperature');
    // La puerta mide cada función por el encabezado x-proceso (no va en el cuerpo).
    expect(create.mock.calls[0][1]).toMatchObject({ timeout: 60_000, headers: { 'x-proceso': 'prueba' } });
    expect(cuerpo).not.toHaveProperty('proceso');
  });

  it('x-proceso queda en [a-z0-9-] y máximo 40 caracteres, como lo acepta la puerta', () => {
    expect(procesoParaPuerta('asistente-actividades')).toBe('asistente-actividades');
    expect(procesoParaPuerta('Reunión Minuta')).toBe('reunion-minuta');
    expect(procesoParaPuerta('eval_acta / v2')).toBe('eval-acta-v2');
    expect(procesoParaPuerta('')).toBe('sin-proceso');
    expect(procesoParaPuerta('***')).toBe('sin-proceso');
    const largo = procesoParaPuerta(`${'a'.repeat(39)}-b`);
    expect(largo).toBe('a'.repeat(39));
    expect(procesoParaPuerta('x'.repeat(60))).toHaveLength(40);
  });

  it('corta con un mensaje claro si la respuesta se truncó o se negó', async () => {
    const truncada = conCliente(jest.fn().mockResolvedValue(respuesta('{"a":', { stop_reason: 'max_tokens' })));
    await expect(
      truncada.json({ proceso: 'p', companyId: 1, sistema: [], usuario: 'x', esquema: {} }),
    ).rejects.toThrow(/demasiado largo/);
    const negada = conCliente(jest.fn().mockResolvedValue(respuesta('', { stop_reason: 'refusal' })));
    await expect(negada.texto({ proceso: 'p', companyId: 1, sistema: [], usuario: 'x' })).rejects.toThrow(/no quiso/);
  });

  it('el presupuesto agotado de la puerta se explica en español', async () => {
    const error = new Anthropic.RateLimitError(
      429,
      { type: 'error', error: { type: 'budget_exceeded', message: 'agotado' } },
      'agotado',
      new Headers(),
    );
    const svc = conCliente(jest.fn().mockRejectedValue(error));
    await expect(svc.texto({ proceso: 'p', companyId: 1, sistema: [], usuario: 'x' })).rejects.toThrow(/presupuesto de IA/);
  });

  it('cada aviso es una sola frase y cita el texto de dos oraciones', async () => {
    const peticion = { proceso: 'p', companyId: 1, sistema: [] as string[], usuario: 'x' };
    const cuerpo = (tipo: string) => ({ type: 'error', error: { type: tipo, message: 'x' } });
    const fallo = (ErrorClase: new (...args: ConstructorParameters<typeof Anthropic.APIError>) => Anthropic.APIError, status: number, tipo: string) =>
      new ErrorClase(status, cuerpo(tipo), 'x', new Headers());
    const topePrevio = process.env.CLAUDE_TOPE_DIARIO;
    delete process.env.CLAUDE_TOPE_DIARIO;

    const casos: { viejo: string; nuevo: string; disparar: () => Promise<unknown> }[] = [
      {
        viejo: 'La IA no respondió. Intenta de nuevo.',
        nuevo: 'La IA no respondió: intenta de nuevo.',
        disparar: () => conCliente(jest.fn().mockRejectedValue(fallo(Anthropic.InternalServerError, 500, 'api_error'))).texto(peticion),
      },
      {
        viejo: 'La IA está saturada en este momento. Intenta de nuevo en un minuto.',
        nuevo: 'La IA está saturada en este momento: intenta de nuevo en un minuto.',
        disparar: () => conCliente(jest.fn().mockRejectedValue(fallo(Anthropic.RateLimitError, 429, 'rate_limit_error'))).texto(peticion),
      },
      {
        viejo: 'La IA respondió en un formato inesperado. Intenta de nuevo.',
        nuevo: 'La IA respondió en un formato inesperado: intenta de nuevo.',
        disparar: () =>
          conCliente(jest.fn().mockResolvedValue(respuesta('no es json'))).json({ ...peticion, esquema: {} }),
      },
      {
        viejo: 'La IA no quiso procesar esa instrucción. Reescríbela con otras palabras.',
        nuevo: 'La IA no quiso procesar esa instrucción: reescríbela con otras palabras.',
        disparar: () =>
          conCliente(jest.fn().mockResolvedValue(respuesta('', { stop_reason: 'refusal' }))).texto(peticion),
      },
      {
        viejo: 'El texto es demasiado largo para procesarlo de una vez. Divídelo.',
        nuevo: 'El texto es demasiado largo para procesarlo de una vez: divídelo.',
        disparar: () =>
          conCliente(jest.fn().mockResolvedValue(respuesta('{"a":', { stop_reason: 'max_tokens' }))).texto(peticion),
      },
      {
        viejo: 'Se acabó el presupuesto de IA de este mes. Avísale al administrador.',
        nuevo: 'Se acabó el presupuesto de IA de este mes: avísale al administrador.',
        disparar: () => conCliente(jest.fn().mockRejectedValue(fallo(Anthropic.RateLimitError, 429, 'budget_exceeded'))).texto(peticion),
      },
      {
        viejo: 'Se alcanzó el tope diario de 300 consultas a la IA para esta empresa. Vuelve a intentarlo mañana.',
        nuevo: 'Se alcanzó el tope diario de 300 consultas a la IA para esta empresa: vuelve a intentarlo mañana.',
        disparar: async () => {
          const svc = conCliente(jest.fn().mockResolvedValue(respuesta('ok')));
          for (let i = 0; i < 300; i++) await svc.texto(peticion);
          return svc.texto(peticion);
        },
      },
      {
        viejo: 'La clave de la IA no es válida. Revisa ANTHROPIC_API_KEY en el servidor.',
        nuevo: 'La clave de la IA no es válida: revisa ANTHROPIC_API_KEY en el servidor.',
        disparar: () => conCliente(jest.fn().mockRejectedValue(fallo(Anthropic.AuthenticationError, 401, 'authentication_error'))).texto(peticion),
      },
    ];

    try {
      for (const { viejo, nuevo, disparar } of casos) {
        const [cabeza, cola] = viejo.split('. ');
        expect(viejo.split('. ')).toHaveLength(2);
        expect(`${cabeza}: ${cola.charAt(0).toLowerCase()}${cola.slice(1)}`).toBe(nuevo);
        let error: unknown;
        try {
          await disparar();
          error = undefined;
        } catch (e) {
          error = e;
        }
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(nuevo);
        expect((error as Error).message).not.toBe(viejo);
      }
    } finally {
      if (topePrevio === undefined) delete process.env.CLAUDE_TOPE_DIARIO;
      else process.env.CLAUDE_TOPE_DIARIO = topePrevio;
    }
  });
});
