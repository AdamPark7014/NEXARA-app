import Anthropic from '@anthropic-ai/sdk';
import { ClaudeService, configuracionPensamiento, contenidoDelMensaje, estimarUsd, procesoParaPuerta, usoDeRespuesta } from './claude.service.js';
import { IaNoDisponibleException, clasificarFallo } from './compuerta-ia.js';
import { reiniciarCachePiloto } from '../../common/piloto/interruptor-piloto.js';

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

describe('contenido del mensaje', () => {
  it('sin fotos es texto y nada más', () => {
    expect(contenidoDelMensaje({ usuario: 'hola' })).toBe('hola');
    expect(contenidoDelMensaje({ usuario: 'hola', imagenes: [] })).toBe('hola');
  });

  it('con fotos, las fotos van antes del texto', () => {
    expect(contenidoDelMensaje({ usuario: 'Lee este ticket.', imagenes: [{ mediaType: 'image/jpeg', base64: 'AAAA' }] })).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
      { type: 'text', text: 'Lee este ticket.' },
    ]);
  });
});

// ── La compuerta en ClaudeService (corte de circuito, sonda, cupo, interruptor) ──────────────────────────────────────

const MIN = 60_000;

function errorApi(
  Clase: new (status: any, error: any, message: any, headers: any) => unknown,
  status: number,
  tipo: string,
  mensaje = 'x',
) {
  return new Clase(status, { type: 'error', error: { type: tipo, message: mensaje } }, mensaje, new Headers());
}
const e401 = () => errorApi(Anthropic.AuthenticationError, 401, 'authentication_error', 'invalid x-api-key');
const e403 = () => errorApi(Anthropic.PermissionDeniedError, 403, 'permission_error');
const e429Presupuesto = () => errorApi(Anthropic.RateLimitError, 429, 'budget_exceeded');
const e429Ritmo = () => errorApi(Anthropic.RateLimitError, 429, 'rate_limit_error');
const e500 = () => errorApi(Anthropic.InternalServerError, 500, 'api_error');
const eModelo = () => errorApi(Anthropic.BadRequestError, 400, 'invalid_request_error', 'El modelo claude-opus-5-5 no está permitido');

const PETICION = { proceso: 'compuerta-prueba', companyId: 1, sistema: [] as string[], usuario: 'x' };

/** Servicio con una base simulada que contesta `modo` (null = sin fila) y un cliente cuyo `create` es el que se pasa. */
function conCompuerta(create: jest.Mock, modo: string | null = 'activo') {
  process.env.ANTHROPIC_API_KEY = 'pia_prueba_x';
  const findFirst = jest.fn(async (_args: unknown) => (modo === null ? null : { value: modo }));
  const svc = new ClaudeService({ systemSetting: { findFirst } } as any);
  (svc as any).cliente = { messages: { create } };
  const silencio = {
    warn: jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined),
    error: jest.spyOn((svc as any).logger, 'error').mockImplementation(() => undefined),
    log: jest.spyOn((svc as any).logger, 'log').mockImplementation(() => undefined),
  };
  return { svc, findFirst, ...silencio };
}

const llamadasContadas = (svc: ClaudeService): number =>
  [...((svc as any).llamadasPorDia as Map<string, number>).values()].reduce((a, b) => a + b, 0);

describe('ClaudeService: compuerta de la IA', () => {
  const previo = {
    llave: process.env.ANTHROPIC_API_KEY,
    base: process.env.CLAUDE_BASE_URL,
    nodeEnv: process.env.NODE_ENV,
    modo: process.env.IA_COMPUERTA_MODO,
    tope: process.env.CLAUDE_TOPE_DIARIO,
    sonda: process.env.IA_SONDA_MINUTOS,
  };
  const restaurar = (nombre: string, valor: string | undefined) => {
    if (valor === undefined) delete process.env[nombre];
    else process.env[nombre] = valor;
  };
  let ahora: jest.SpyInstance<number, []> | undefined;
  /** Mueve el reloj (lo usan la compuerta y la caché del interruptor). */
  const irA = (t: number) => {
    ahora?.mockRestore();
    ahora = jest.spyOn(Date, 'now').mockReturnValue(t);
  };

  beforeEach(() => {
    reiniciarCachePiloto();
    delete process.env.IA_COMPUERTA_MODO;
    delete process.env.CLAUDE_TOPE_DIARIO;
    delete process.env.IA_SONDA_MINUTOS;
  });
  afterEach(() => {
    ahora?.mockRestore();
    ahora = undefined;
    restaurar('ANTHROPIC_API_KEY', previo.llave);
    restaurar('CLAUDE_BASE_URL', previo.base);
    restaurar('NODE_ENV', previo.nodeEnv);
    restaurar('IA_COMPUERTA_MODO', previo.modo);
    restaurar('CLAUDE_TOPE_DIARIO', previo.tope);
    restaurar('IA_SONDA_MINUTOS', previo.sonda);
  });

  it('tres 401 seguidos en modo activo: la cuarta llamada no llega a create, no gasta cupo y trae el code IA_NO_DISPONIBLE', async () => {
    const create = jest.fn().mockRejectedValue(e401());
    const { svc } = conCompuerta(create, 'activo');
    for (let i = 0; i < 3; i++) {
      const error = await svc.texto(PETICION).catch((e) => e);
      expect(error).toBeInstanceOf(IaNoDisponibleException);
      expect(error.message).toBe('La clave de la IA no es válida: revisa ANTHROPIC_API_KEY en el servidor.');
      expect(error.getResponse()).toMatchObject({ statusCode: 503, code: 'IA_NO_DISPONIBLE' });
    }
    expect(create).toHaveBeenCalledTimes(3);
    // Cada llamada contó contra el cupo del día (la devolución de lo que la puerta no cobra llega en compuerta-ia#2).
    expect(llamadasContadas(svc)).toBe(3);
    expect(svc.disponible()).toBe(false);

    const cuarta = await svc.texto(PETICION).catch((e) => e);
    expect(create).toHaveBeenCalledTimes(3);
    expect(cuarta).toBeInstanceOf(IaNoDisponibleException);
    expect(cuarta.getResponse()).toMatchObject({ statusCode: 503, error: 'Service Unavailable', code: 'IA_NO_DISPONIBLE' });
    expect(cuarta).toMatchObject({ motivo: 'llave_puerta_invalida', sinCosto: true });
    expect(cuarta.reintentoEn).toBeGreaterThan(0);
    // El corte negó antes de contar el cupo: sigue en 3, no pasa a 4.
    expect(llamadasContadas(svc)).toBe(3);
    expect(svc.estadoIa()).toMatchObject({ estado: 'caida', modo: 'activo', configurada: true, motivo: 'llave_puerta_invalida' });
  });

  it('en modo observar la cuarta llamada sí llama, la caída se cuenta pero disponible() sigue como hoy', async () => {
    const create = jest.fn().mockRejectedValue(e401());
    const { svc } = conCompuerta(create, 'observar');
    for (let i = 0; i < 4; i++) {
      const error = await svc.texto(PETICION).catch((e) => e);
      expect(error.message).toBe('La clave de la IA no es válida: revisa ANTHROPIC_API_KEY en el servidor.');
    }
    expect(create).toHaveBeenCalledTimes(4);
    expect(svc.compuerta.instantanea()).toMatchObject({ estado: 'caida', motivo: 'llave_puerta_invalida' });
    expect(svc.disponible()).toBe(true);
    expect(svc.estadoIa()).toMatchObject({ estado: 'caida', modo: 'observar' });
  });

  it('sin fila en la base el modo es observar; una fila mal escrita lo apaga; cada clave se lee por separado', async () => {
    const sinFila = conCompuerta(jest.fn(), null);
    expect(await sinFila.svc.modoIa('ia.compuerta.modo')).toBe('observar');
    expect(await sinFila.svc.modoIa('ia.topes.modo')).toBe('observar');
    expect(await sinFila.svc.modoIa('ia.relleno_complejidad.modo')).toBe('observar');
    expect(sinFila.findFirst.mock.calls.map(([args]) => (args as { where: { key: string } }).where.key).sort()).toEqual([
      'ia.compuerta.modo',
      'ia.relleno_complejidad.modo',
      'ia.topes.modo',
    ]);
    reiniciarCachePiloto();
    const rara = conCompuerta(jest.fn(), 'quizá');
    expect(await rara.svc.modoIa('ia.compuerta.modo')).toBe('apagado');
  });

  it('sin base (evals, pruebas) el modo sale de IA_COMPUERTA_MODO y, si falta, es apagado; lo demás siempre apagado', async () => {
    process.env.ANTHROPIC_API_KEY = 'pia_prueba_x';
    const svc = new ClaudeService();
    expect(await svc.modoIa('ia.compuerta.modo')).toBe('apagado');
    expect(await svc.modoIa('ia.topes.modo')).toBe('apagado');
    process.env.IA_COMPUERTA_MODO = 'activo';
    expect(await svc.modoIa('ia.compuerta.modo')).toBe('activo');
    expect(await svc.modoIa('ia.topes.modo')).toBe('apagado');

    // Y sin base la compuerta funciona igual desde el entorno, sin timers ni consultas.
    const create = jest.fn().mockRejectedValue(e401());
    (svc as any).cliente = { messages: { create } };
    jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn((svc as any).logger, 'error').mockImplementation(() => undefined);
    for (let i = 0; i < 4; i++) await svc.texto(PETICION).catch(() => undefined);
    expect(create).toHaveBeenCalledTimes(3);
    expect(svc.disponible()).toBe(false);
    process.env.IA_COMPUERTA_MODO = 'apagado';
    expect(svc.disponible()).toBe(true);
  });

  it('con la compuerta apagada nada se cuenta: ni cae ni emite', async () => {
    const create = jest.fn().mockRejectedValue(e401());
    const { svc } = conCompuerta(create, 'apagado');
    for (let i = 0; i < 6; i++) await svc.texto(PETICION).catch(() => undefined);
    expect(create).toHaveBeenCalledTimes(6);
    expect(svc.compuerta.instantanea()).toMatchObject({ estado: 'ok', fallosSeguidos: 0 });
  });

  it.each([
    ['401', true, e401],
    ['403', true, e403],
    ['presupuesto agotado', true, e429Presupuesto],
    ['429 por ritmo', false, e429Ritmo],
    ['500', false, e500],
    ['tiempo agotado', false, () => new Anthropic.APIConnectionTimeoutError()],
    ['modelo no permitido', false, eModelo],
  ])('tabla de clasificación: %s (corta: %s)', async (_nombre, corta, fabricar) => {
    const create = jest.fn().mockRejectedValue(fabricar());
    const { svc } = conCompuerta(create, 'activo');
    for (let i = 0; i < 6; i++) await svc.texto(PETICION).catch(() => undefined);
    expect(create).toHaveBeenCalledTimes(corta ? 3 : 6);
    expect(svc.compuerta.instantanea().estado).toBe(corta ? 'caida' : 'ok');
  });

  it('todo fallo de la puerta sale como IaNoDisponibleException con el mismo texto de siempre', async () => {
    const casos: [() => unknown, RegExp, string][] = [
      [e403, /^La IA no respondió: intenta de nuevo\.$/, 'proyecto_desactivado'],
      [e429Presupuesto, /presupuesto de IA/, 'presupuesto_agotado'],
      [e429Ritmo, /saturada/, 'saturada'],
      [e500, /^La IA no respondió/, 'error_servicio'],
      [eModelo, /no está permitido para NEXARA/, 'modelo_no_permitido'],
    ];
    for (const [fabricar, texto, motivo] of casos) {
      reiniciarCachePiloto();
      const { svc } = conCompuerta(jest.fn().mockRejectedValue(fabricar()), 'apagado');
      const error = await svc.texto(PETICION).catch((e) => e);
      expect(error).toBeInstanceOf(IaNoDisponibleException);
      expect(error.message).toMatch(texto);
      expect(error.motivo).toBe(motivo);
      expect(error.getResponse().code).toBe('IA_NO_DISPONIBLE');
    }
  });

  it('lo que no es de la API se relanza tal cual y no cuenta', async () => {
    const raro = new TypeError('algo propio');
    const { svc } = conCompuerta(jest.fn().mockRejectedValue(raro), 'activo');
    for (let i = 0; i < 5; i++) await expect(svc.texto(PETICION)).rejects.toBe(raro);
    expect(svc.compuerta.instantanea().estado).toBe('ok');
  });

  it('la caída se anota UNA vez (error) y el aviso por llamada pasa a warn, a lo sumo uno por minuto y motivo', async () => {
    irA(Date.UTC(2026, 10, 28, 15, 0, 0));
    const create = jest.fn().mockRejectedValue(e401());
    const { svc, warn, error: errorLog, log } = conCompuerta(create, 'observar');
    for (let i = 0; i < 8; i++) await svc.texto(PETICION).catch(() => undefined);
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog.mock.calls[0][0]).toMatch(/^\[Compuerta IA\] CAIDA motivo=llave_puerta_invalida tras 3 fallos/);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/ANTHROPIC_API_KEY inválida/);

    // Pasado el minuto vuelve a avisar y cuenta los que se callaron.
    irA(Date.UTC(2026, 10, 28, 15, 1, 1));
    await svc.texto(PETICION).catch(() => undefined);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1][0]).toMatch(/\(\+7 iguales desde el último aviso\)/);

    // Un éxito cierra la caída con un solo renglón.
    create.mockResolvedValueOnce(respuesta('ok'));
    await svc.texto(PETICION);
    expect(log.mock.calls.map(([m]) => String(m)).filter((m) => m.includes('[Compuerta IA]'))).toEqual([
      '[Compuerta IA] VOLVIO tras 1 min',
    ]);
    expect(svc.compuerta.instantanea().estado).toBe('ok');
  });

  it('en caída y modo activo, pasado el próximo intento UNA llamada real hace de sonda: si sale bien cierra, si falla reabre', async () => {
    const t0 = Date.UTC(2026, 10, 28, 15, 0, 0);
    irA(t0);
    const create = jest.fn().mockRejectedValue(e401());
    const { svc } = conCompuerta(create, 'activo');
    for (let i = 0; i < 3; i++) await svc.texto(PETICION).catch(() => undefined);
    expect(svc.disponible()).toBe(false);

    // A los 5 min toca la sonda: la llamada pasa, pero vuelve a fallar → reabre con 10 min.
    irA(t0 + 5 * MIN);
    expect(svc.disponible()).toBe(true);
    await svc.texto(PETICION).catch(() => undefined);
    expect(create).toHaveBeenCalledTimes(4);
    expect(svc.compuerta.instantanea()).toMatchObject({ estado: 'caida', proximoIntento: t0 + 15 * MIN, esperaActualMin: 10 });
    await expect(svc.texto(PETICION)).rejects.toBeInstanceOf(IaNoDisponibleException);
    expect(create).toHaveBeenCalledTimes(4);

    // A los 15 min la puerta volvió: la sonda sale bien y todo se abre.
    irA(t0 + 15 * MIN);
    create.mockResolvedValueOnce(respuesta('ok'));
    await svc.texto(PETICION);
    expect(svc.compuerta.instantanea()).toMatchObject({ estado: 'ok', fallosSeguidos: 0 });
    expect(svc.disponible()).toBe(true);
    create.mockResolvedValue(respuesta('ok'));
    await svc.texto(PETICION);
    expect(create).toHaveBeenCalledTimes(6);
  });

  it('si el cupo diario frena a quien traía el permiso de sonda, el permiso no queda ocupado', async () => {
    const t0 = Date.UTC(2026, 10, 28, 15, 0, 0);
    irA(t0);
    process.env.CLAUDE_TOPE_DIARIO = '3';
    const create = jest.fn().mockResolvedValue(respuesta('ok'));
    const { svc } = conCompuerta(create, 'activo');
    // Tres llamadas buenas llenan el cupo.
    for (let i = 0; i < 3; i++) await svc.texto(PETICION);
    expect(llamadasContadas(svc)).toBe(3);
    // La sonda del cron encuentra la llave muerta: la caída se abre al instante.
    svc.compuerta.registrarFallo(clasificarFallo(e401()), 'nexara-sonda', true);
    expect(svc.compuerta.instantanea().estado).toBe('caida');
    irA(t0 + 5 * MIN);
    const frenada = await svc.texto(PETICION).catch((e) => e);
    expect(frenada.message).toMatch(/tope diario de 3 consultas/);
    expect(create).toHaveBeenCalledTimes(3);
    expect(svc.compuerta.instantanea().sondaEnVuelo).toBe(false);
    expect(svc.compuerta.permite()).toBe(true);
  });

  describe('disponible()', () => {
    it('es falso sin llave', () => {
      delete process.env.ANTHROPIC_API_KEY;
      expect(new ClaudeService().disponible()).toBe(false);
      process.env.ANTHROPIC_API_KEY = '   ';
      expect(new ClaudeService().disponible()).toBe(false);
    });

    it('es falso en producción sin CLAUDE_BASE_URL y verdadero con ella (o fuera de producción)', () => {
      process.env.ANTHROPIC_API_KEY = 'pia_prueba_x';
      process.env.NODE_ENV = 'production';
      delete process.env.CLAUDE_BASE_URL;
      expect(new ClaudeService().disponible()).toBe(false);
      expect(new ClaudeService().configurada()).toBe(false);
      process.env.CLAUDE_BASE_URL = 'http://puerta-ia:8080';
      expect(new ClaudeService().disponible()).toBe(true);
      process.env.NODE_ENV = 'development';
      delete process.env.CLAUDE_BASE_URL;
      expect(new ClaudeService().disponible()).toBe(true);
    });

    it('en producción sin la URL de la puerta, llamar sigue diciendo qué falta', async () => {
      process.env.ANTHROPIC_API_KEY = 'pia_prueba_x';
      process.env.NODE_ENV = 'production';
      delete process.env.CLAUDE_BASE_URL;
      const error = await new ClaudeService().texto(PETICION).catch((e) => e);
      expect(error.message).toMatch(/falta CLAUDE_BASE_URL/);
    });

    it('lee el modo de la base sin esperar y no vuelve a preguntar dentro de los 30 s', async () => {
      irA(Date.UTC(2026, 10, 28, 15, 0, 0));
      const { svc, findFirst } = conCompuerta(jest.fn(), 'activo');
      // Aún no se leyó el modo: se trata como no activo y la lectura sale atrás.
      expect(svc.disponible()).toBe(true);
      await new Promise((r) => setImmediate(r));
      expect(findFirst).toHaveBeenCalledTimes(1);
      expect(svc.compuerta.modo).toBe('activo');
      svc.disponible();
      expect(findFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe('sondear()', () => {
    it('manda la llamada mínima con x-proceso nexara-sonda, sin gastar cupo, y le devuelve el resultado a la compuerta', async () => {
      const create = jest.fn().mockResolvedValue(respuesta('ok'));
      const { svc } = conCompuerta(create, 'observar');
      await svc.sondearSiToca(); // deja puesto el modo
      expect(create).toHaveBeenCalledTimes(1);
      const [cuerpo, opciones] = create.mock.calls[0];
      expect(cuerpo).toEqual({
        model: 'claude-haiku-5-5',
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ok' }],
        thinking: { type: 'disabled' },
        output_config: { effort: 'low' },
      });
      expect(opciones).toEqual({ timeout: 15_000, maxRetries: 0, headers: { 'x-proceso': 'nexara-sonda' } });
      expect(llamadasContadas(svc)).toBe(0);
      expect(svc.compuerta.instantanea().ultimaBuena).toMatchObject({ proceso: 'nexara-sonda', modelo: 'claude-haiku-5-5' });
      // La sonda no cuenta en la cuenta por empresa.
      expect(svc.compuerta.contadoresDelDia().filas).toEqual([]);
    });

    it('una sonda con 401 abre la caída al instante; una buena la cierra', async () => {
      const t0 = Date.UTC(2026, 10, 28, 15, 0, 0);
      irA(t0);
      const create = jest.fn().mockRejectedValue(e401());
      const { svc, error: errorLog } = conCompuerta(create, 'observar');
      expect(await svc.sondearSiToca()).toBe(true);
      expect(svc.compuerta.instantanea()).toMatchObject({ estado: 'caida', fallosSeguidos: 1, proximoIntento: t0 + 5 * MIN });
      expect(errorLog.mock.calls[0][0]).toMatch(/CAIDA motivo=llave_puerta_invalida tras 1 fallo de la sonda/);
      // Aún no toca: 4 min.
      irA(t0 + 4 * MIN);
      expect(await svc.sondearSiToca()).toBe(false);
      expect(create).toHaveBeenCalledTimes(1);
      // Toca, y la puerta ya responde.
      irA(t0 + 5 * MIN);
      create.mockResolvedValue(respuesta('ok'));
      expect(await svc.sondearSiToca()).toBe(true);
      expect(svc.compuerta.instantanea().estado).toBe('ok');
      expect(create).toHaveBeenCalledTimes(2);
    });

    it('sondear() nunca lanza: un fallo cualquiera se anota y devuelve false', async () => {
      const { svc } = conCompuerta(jest.fn().mockRejectedValue(new TypeError('boom')), 'observar');
      await svc.sondearSiToca();
      expect(await svc.sondear()).toBe(false);
      delete process.env.ANTHROPIC_API_KEY;
      expect(await svc.sondear()).toBe(false);
    });
  });

  describe('sondearSiToca()', () => {
    it('con el modo apagado o sin configuración no sondea nunca', async () => {
      const apagado = conCompuerta(jest.fn().mockResolvedValue(respuesta('ok')), 'apagado');
      expect(await apagado.svc.sondearSiToca()).toBe(false);
      expect((apagado.svc as any).cliente.messages.create).not.toHaveBeenCalled();
      reiniciarCachePiloto();
      const sinLlave = conCompuerta(jest.fn().mockResolvedValue(respuesta('ok')), 'observar');
      delete process.env.ANTHROPIC_API_KEY;
      expect(await sinLlave.svc.sondearSiToca()).toBe(false);
      expect((sinLlave.svc as any).cliente.messages.create).not.toHaveBeenCalled();
    });

    it('con la compuerta ok sondea la primera vez y luego cada 30 min (IA_SONDA_MINUTOS lo cambia)', async () => {
      const t0 = Date.UTC(2026, 10, 28, 15, 0, 0);
      irA(t0);
      const create = jest.fn().mockResolvedValue(respuesta('ok'));
      const { svc } = conCompuerta(create, 'observar');
      expect(await svc.sondearSiToca()).toBe(true);
      irA(t0 + 29 * MIN);
      expect(await svc.sondearSiToca()).toBe(false);
      irA(t0 + 30 * MIN);
      expect(await svc.sondearSiToca()).toBe(true);
      expect(create).toHaveBeenCalledTimes(2);

      process.env.IA_SONDA_MINUTOS = '5';
      irA(t0 + 34 * MIN);
      expect(await svc.sondearSiToca()).toBe(false);
      irA(t0 + 35 * MIN);
      expect(await svc.sondearSiToca()).toBe(true);
      expect(create).toHaveBeenCalledTimes(3);
    });
  });
});
