import { ServiceUnavailableException } from '@nestjs/common';
import { TranscriptorService } from './transcriptor.service';

/** El texto viejo eran dos frases. */
const TEXTO_VIEJO = 'El transcriptor no respondió. Intenta de nuevo.';
const FRASE = 'El transcriptor no respondió: intenta de nuevo.';

describe('cuando el transcriptor no responde', () => {
  const fetchOriginal = globalThis.fetch;
  const urlOriginal = process.env.TRANSCRIPTOR_URL;

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    if (urlOriginal === undefined) delete process.env.TRANSCRIPTOR_URL;
    else process.env.TRANSCRIPTOR_URL = urlOriginal;
  });

  it('cita el texto viejo «El transcriptor no respondió. Intenta de nuevo.» y lo deja en una frase', async () => {
    process.env.TRANSCRIPTOR_URL = 'http://transcriptor.test';
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('abort'));
    const svc = new TranscriptorService();

    const error = await svc
      .transcribir(Buffer.from('audio'), 'dictado.webm', 'audio/webm', 1_000)
      .then(() => {
        throw new Error('el transcriptor debía fallar');
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    const cuerpo = (error as ServiceUnavailableException).getResponse();
    const mensaje = typeof cuerpo === 'string' ? cuerpo : String((cuerpo as { message?: unknown }).message);
    expect(mensaje).toBe(FRASE);
    expect(mensaje).not.toBe(TEXTO_VIEJO);
    expect(mensaje.split('. ').filter(Boolean)).toHaveLength(1);
  });
});

describe('dictado con su propio transcriptor', () => {
  const fetchOriginal = globalThis.fetch;
  const urlOriginal = process.env.TRANSCRIPTOR_URL;
  const dictadoOriginal = process.env.TRANSCRIPTOR_DICTADO_URL;
  const ok = (text: string) => ({ ok: true, status: 200, text: async () => JSON.stringify({ text }) });

  beforeEach(() => {
    process.env.TRANSCRIPTOR_URL = 'http://transcriptor.test';
    process.env.TRANSCRIPTOR_DICTADO_URL = 'http://dictado.test/';
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    for (const [k, v] of [
      ['TRANSCRIPTOR_URL', urlOriginal],
      ['TRANSCRIPTOR_DICTADO_URL', dictadoOriginal],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('el dictado va al de dictado y la junta sigue en el principal', async () => {
    const fetchMock = jest.fn().mockResolvedValue(ok('Asignar a Luis la revisión.'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const svc = new TranscriptorService();

    await expect(svc.dictar(Buffer.from('audio'), 'dictado.webm', 'audio/webm')).resolves.toBe(
      'Asignar a Luis la revisión.',
    );
    await svc.transcribir(Buffer.from('audio'), 'parte-0001.webm', 'audio/webm');

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'http://dictado.test/inference',
      'http://transcriptor.test/inference',
    ]);
  });

  it('si el de dictado no responde, cae al principal', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(ok('Texto del principal.'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const svc = new TranscriptorService();

    await expect(svc.dictar(Buffer.from('audio'), 'dictado.webm', 'audio/webm', 10_000)).resolves.toBe(
      'Texto del principal.',
    );
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'http://dictado.test/inference',
      'http://transcriptor.test/inference',
    ]);
  });

  it('sin TRANSCRIPTOR_DICTADO_URL el dictado usa el principal', async () => {
    delete process.env.TRANSCRIPTOR_DICTADO_URL;
    const fetchMock = jest.fn().mockResolvedValue(ok('Hola.'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await new TranscriptorService().dictar(Buffer.from('audio'), 'dictado.webm', 'audio/webm');
    expect(fetchMock.mock.calls[0][0]).toBe('http://transcriptor.test/inference');
  });

  it('una falla del de dictado no marca al principal como caído', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(ok('Texto.'))
      .mockResolvedValueOnce({ status: 200 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const svc = new TranscriptorService();

    await svc.dictar(Buffer.from('audio'), 'dictado.webm', 'audio/webm', 10_000);
    await expect(svc.disponible()).resolves.toBe(true);
  });
});
