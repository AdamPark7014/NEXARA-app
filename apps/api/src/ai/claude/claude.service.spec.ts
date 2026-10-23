import Anthropic from '@anthropic-ai/sdk';
import { ClaudeService, configuracionPensamiento, estimarUsd, usoDeRespuesta } from './claude.service.js';

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
});
