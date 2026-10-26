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
