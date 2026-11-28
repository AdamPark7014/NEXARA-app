import Anthropic from '@anthropic-ai/sdk';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  CompuertaIa,
  IaNoDisponibleException,
  SONDA_COLGADA_MS,
  clasificarFallo,
  textoDeCorte,
  type ClaseFallo,
  type EventoCompuerta,
  type ModoIa,
} from './compuerta-ia';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 28, 15, 0, 0); // 28-11-2026 09:00 en México

const cuerpo = (tipo: string, mensaje = 'x') => ({ type: 'error', error: { type: tipo, message: mensaje } });

function error401(mensaje = 'invalid x-api-key') {
  return new Anthropic.AuthenticationError(401, cuerpo('authentication_error', mensaje), mensaje, new Headers());
}
function error403() {
  return new Anthropic.PermissionDeniedError(403, cuerpo('permission_error', 'proyecto desactivado'), 'proyecto desactivado', new Headers());
}
function error429(tipo = 'rate_limit_error') {
  return new Anthropic.RateLimitError(429, cuerpo(tipo, 'x'), 'x', new Headers());
}
function error500() {
  return new Anthropic.InternalServerError(500, cuerpo('api_error', 'x'), 'x', new Headers());
}
function errorModeloNoPermitido() {
  const mensaje = 'El modelo claude-opus-5-5 no está permitido para este proyecto';
  return new Anthropic.BadRequestError(400, cuerpo('invalid_request_error', mensaje), mensaje, new Headers());
}
function error413() {
  return new Anthropic.APIError(413, cuerpo('request_too_large', 'x'), 'x', new Headers());
}

const llave = () => clasificarFallo(error401());

/** Compuerta con reloj falso. `reloj.t` es el «ahora» en milisegundos. */
function nueva(modo: ModoIa = 'activo', extra: { fallosParaCortar?: number; minutosMax?: number } = {}) {
  const reloj = { t: T0 };
  const compuerta = new CompuertaIa({ reloj: () => reloj.t, modo, ...extra });
  const eventos: EventoCompuerta[] = [];
  compuerta.alCambiar((e) => eventos.push(e));
  const avanzar = (ms: number) => {
    reloj.t += ms;
  };
  /** Un fallo de una llamada real que antes pidió paso (como hace `ClaudeService`). */
  const fallaLlamada = (clase: ClaseFallo) => {
    const paso = compuerta.pedirPaso();
    compuerta.registrarFallo(clase, 'p', paso.esSonda, 1);
  };
  return { compuerta, reloj, eventos, avanzar, fallaLlamada };
}

describe('clasificarFallo', () => {
  it('401, 403 y presupuesto agotado cuentan para el corte y no gastan cupo', () => {
    expect(clasificarFallo(error401())).toMatchObject({ motivo: 'llave_puerta_invalida', cuentaParaCorte: true, sinCosto: true });
    expect(clasificarFallo(error403())).toMatchObject({ motivo: 'proyecto_desactivado', cuentaParaCorte: true, sinCosto: true });
    expect(clasificarFallo(error429('budget_exceeded'))).toMatchObject({
      motivo: 'presupuesto_agotado',
      cuentaParaCorte: true,
      sinCosto: true,
    });
  });

  it('distingue «Token de proyecto» de cualquier otro 401', () => {
    expect(clasificarFallo(error401('Token de proyecto inválido o revocado'))).toMatchObject({
      motivo: 'token_nexara_invalido',
      cuentaParaCorte: true,
    });
    expect(clasificarFallo(error401('invalid x-api-key'))).toMatchObject({ motivo: 'llave_puerta_invalida' });
    // También si la frase viene solo en el cuerpo y no en `message`.
    const soloCuerpo = new Anthropic.AuthenticationError(401, cuerpo('authentication_error', 'Token de proyecto vencido'), undefined, new Headers());
    expect(clasificarFallo(soloCuerpo).motivo).toBe('token_nexara_invalido');
  });

  it('un 429 normal, el modelo no permitido y el 413 no cuentan y no gastan cupo', () => {
    expect(clasificarFallo(error429())).toMatchObject({ motivo: 'saturada', cuentaParaCorte: false, sinCosto: true });
    expect(clasificarFallo(errorModeloNoPermitido())).toMatchObject({
      motivo: 'modelo_no_permitido',
      cuentaParaCorte: false,
      sinCosto: true,
    });
    expect(clasificarFallo(error413())).toMatchObject({ motivo: 'solicitud_grande', cuentaParaCorte: false, sinCosto: true });
  });

  it('5xx, tiempo agotado, sin conexión y errores raros no cuentan y SÍ gastan cupo', () => {
    expect(clasificarFallo(error500())).toMatchObject({ motivo: 'error_servicio', cuentaParaCorte: false, sinCosto: false });
    expect(clasificarFallo(new Anthropic.APIConnectionTimeoutError())).toMatchObject({
      motivo: 'sin_conexion',
      cuentaParaCorte: false,
      sinCosto: false,
    });
    expect(clasificarFallo(new Anthropic.APIConnectionError({ message: 'ECONNRESET' }))).toMatchObject({
      cuentaParaCorte: false,
      sinCosto: false,
    });
    expect(clasificarFallo(new TypeError('boom'))).toMatchObject({ motivo: 'desconocido', cuentaParaCorte: false, sinCosto: false });
    expect(clasificarFallo('texto')).toMatchObject({ motivo: 'desconocido', cuentaParaCorte: false });
    // Un 400 cualquiera (no el del modelo) tampoco corta ni se da por gratis.
    const otro400 = new Anthropic.BadRequestError(400, cuerpo('invalid_request_error', 'campo mal'), 'campo mal', new Headers());
    expect(clasificarFallo(otro400)).toMatchObject({ motivo: 'solicitud_rechazada', cuentaParaCorte: false, sinCosto: false });
  });

  it('el detalle lleva solo el estado y el tipo, nunca el mensaje', () => {
    const clase = clasificarFallo(error401('texto con datos de la empresa'));
    expect(clase.detalle).toBe('401 authentication_error');
    expect(clase.detalle).not.toMatch(/empresa/);
  });
});

describe('IaNoDisponibleException', () => {
  it('es un 503 de siempre, con el mismo message y el code IA_NO_DISPONIBLE', () => {
    const e = new IaNoDisponibleException('La IA no respondió: intenta de nuevo.', 'error_servicio', false);
    expect(e).toBeInstanceOf(ServiceUnavailableException);
    expect(e.getStatus()).toBe(503);
    expect(e.message).toBe('La IA no respondió: intenta de nuevo.');
    expect(e.getResponse()).toEqual({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'La IA no respondió: intenta de nuevo.',
      code: 'IA_NO_DISPONIBLE',
    });
    expect(e.motivo).toBe('error_servicio');
    expect(e.sinCosto).toBe(false);
    expect(e.reintentoEn).toBeUndefined();
  });
});

describe('CompuertaIa', () => {
  it('(1) con 2 fallos de llave sigue ok y al tercero emite un CAIDA', () => {
    const { compuerta, eventos, fallaLlamada } = nueva();
    fallaLlamada(llave());
    fallaLlamada(llave());
    expect(compuerta.instantanea().estado).toBe('ok');
    expect(compuerta.permite()).toBe(true);
    expect(eventos).toEqual([]);
    fallaLlamada(llave());
    expect(compuerta.instantanea()).toMatchObject({ estado: 'caida', motivo: 'llave_puerta_invalida', fallosSeguidos: 3 });
    expect(eventos).toEqual([
      { tipo: 'CAIDA', motivo: 'llave_puerta_invalida', desde: T0, detalle: '401 authentication_error', origen: 'llamada', fallos: 3 },
    ]);
  });

  it('(2) un éxito entre medias reinicia la cuenta', () => {
    const { compuerta, eventos, fallaLlamada } = nueva();
    fallaLlamada(llave());
    fallaLlamada(llave());
    compuerta.registrarBuena('p', 'claude-haiku-5-5', 1);
    expect(compuerta.instantanea().fallosSeguidos).toBe(0);
    fallaLlamada(llave());
    fallaLlamada(llave());
    expect(compuerta.instantanea().estado).toBe('ok');
    expect(eventos).toEqual([]);
    fallaLlamada(llave());
    expect(compuerta.instantanea().estado).toBe('caida');
  });

  it('(3) timeout, 500, 429 normal, modelo no permitido y 413 no cuentan ni reinician', () => {
    const { compuerta, eventos, fallaLlamada } = nueva();
    fallaLlamada(llave());
    fallaLlamada(llave());
    for (const e of [
      new Anthropic.APIConnectionTimeoutError(),
      error500(),
      error429(),
      errorModeloNoPermitido(),
      error413(),
      new Anthropic.APIConnectionError({ message: 'ECONNRESET' }),
    ]) {
      fallaLlamada(clasificarFallo(e));
    }
    // Ni sumaron (sigue ok con 2)...
    expect(compuerta.instantanea()).toMatchObject({ estado: 'ok', fallosSeguidos: 2 });
    expect(eventos).toEqual([]);
    // ...ni reiniciaron: el siguiente fallo de llave es el tercero.
    fallaLlamada(llave());
    expect(compuerta.instantanea().estado).toBe('caida');
  });

  it('(4) el presupuesto agotado abre igual que un 401, con su motivo', () => {
    const { compuerta, eventos, fallaLlamada } = nueva();
    const presupuesto = clasificarFallo(error429('budget_exceeded'));
    fallaLlamada(presupuesto);
    fallaLlamada(presupuesto);
    fallaLlamada(presupuesto);
    expect(compuerta.instantanea()).toMatchObject({ estado: 'caida', motivo: 'presupuesto_agotado' });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: 'CAIDA', motivo: 'presupuesto_agotado' });
  });

  it('un 403 y un token de NEXARA inválido también abren, y los motivos distintos se suman', () => {
    const { compuerta, eventos, fallaLlamada } = nueva();
    fallaLlamada(clasificarFallo(error403()));
    fallaLlamada(clasificarFallo(error401('Token de proyecto inválido')));
    fallaLlamada(llave());
    expect(eventos).toHaveLength(1);
    // El motivo es el del fallo que abrió.
    expect(compuerta.instantanea().motivo).toBe('llave_puerta_invalida');
  });

  it('(5) en caída niega antes del próximo intento, luego da UN permiso de sonda y el segundo pedido se niega', () => {
    const { compuerta, avanzar, fallaLlamada } = nueva();
    for (let i = 0; i < 3; i++) fallaLlamada(llave());
    expect(compuerta.permite()).toBe(false);

    avanzar(4 * MIN + 59_000);
    let negada: unknown;
    try {
      compuerta.pedirPaso();
    } catch (e) {
      negada = e;
    }
    expect(negada).toBeInstanceOf(IaNoDisponibleException);
    expect((negada as IaNoDisponibleException).getResponse()).toMatchObject({ code: 'IA_NO_DISPONIBLE', statusCode: 503 });
    expect((negada as IaNoDisponibleException).motivo).toBe('llave_puerta_invalida');
    expect((negada as IaNoDisponibleException).sinCosto).toBe(true);
    expect((negada as IaNoDisponibleException).reintentoEn).toBe(1);
    expect((negada as IaNoDisponibleException).message).toBe(textoDeCorte('llave_puerta_invalida'));

    avanzar(1_000); // llegó el momento
    expect(compuerta.permite()).toBe(true);
    expect(compuerta.pedirPaso()).toEqual({ esSonda: true });
    // La sonda sigue en vuelo: nadie más pasa, ni mirando ni pidiendo.
    expect(compuerta.permite()).toBe(false);
    expect(() => compuerta.pedirPaso()).toThrow(IaNoDisponibleException);
    expect(compuerta.instantanea().sondaEnVuelo).toBe(true);
  });

  it('(6) una sonda colgada más de 30 s libera el permiso', () => {
    const { compuerta, avanzar, fallaLlamada } = nueva();
    for (let i = 0; i < 3; i++) fallaLlamada(llave());
    avanzar(5 * MIN);
    expect(compuerta.pedirPaso().esSonda).toBe(true);
    avanzar(SONDA_COLGADA_MS - 1);
    expect(() => compuerta.pedirPaso()).toThrow(IaNoDisponibleException);
    avanzar(1);
    expect(compuerta.permite()).toBe(true);
    expect(compuerta.pedirPaso().esSonda).toBe(true);
  });

  it('(7) una sonda buena emite VOLVIO con la duración y la escalera vuelve a 5 min', () => {
    const { compuerta, eventos, avanzar, fallaLlamada } = nueva();
    for (let i = 0; i < 3; i++) fallaLlamada(llave());
    // Una sonda fallida sube la escalera a 10 min...
    avanzar(5 * MIN);
    compuerta.registrarFallo(llave(), 'nexara-sonda', compuerta.pedirPaso().esSonda);
    expect(compuerta.instantanea().esperaActualMin).toBe(10);
    // ...y una buena la cierra.
    avanzar(10 * MIN);
    const paso = compuerta.pedirPaso();
    expect(paso.esSonda).toBe(true);
    compuerta.registrarBuena('p', 'claude-haiku-5-5', 1);
    expect(eventos.filter((e) => e.tipo === 'VOLVIO')).toEqual([{ tipo: 'VOLVIO', desde: T0, hasta: T0 + 15 * MIN }]);
    expect(compuerta.instantanea()).toMatchObject({ estado: 'ok', motivo: null, fallosSeguidos: 0, esperaActualMin: 5, sondaEnVuelo: false });
    expect(compuerta.permite()).toBe(true);
    expect(compuerta.pedirPaso()).toEqual({ esSonda: false });

    // La próxima caída vuelve a empezar en 5 min.
    for (let i = 0; i < 3; i++) fallaLlamada(llave());
    expect(compuerta.instantanea().proximoIntento).toBe(T0 + 15 * MIN + 5 * MIN);
  });

  it('(7) una sonda con 401 reabre con 10, luego 20, luego 30 y no pasa de 30', () => {
    const { compuerta, eventos, reloj, avanzar, fallaLlamada } = nueva();
    for (let i = 0; i < 3; i++) fallaLlamada(llave());
    expect(compuerta.instantanea().proximoIntento).toBe(T0 + 5 * MIN);
    for (const espera of [10, 20, 30, 30, 30]) {
      reloj.t = compuerta.instantanea().proximoIntento!;
      const paso = compuerta.pedirPaso();
      expect(paso.esSonda).toBe(true);
      compuerta.registrarFallo(llave(), 'p', paso.esSonda, 1);
      expect(compuerta.instantanea().proximoIntento).toBe(reloj.t + espera * MIN);
      expect(compuerta.instantanea().esperaActualMin).toBe(espera);
      expect(compuerta.instantanea().sondaEnVuelo).toBe(false);
    }
    avanzar(0);
    // Reabrir no es una caída nueva.
    expect(eventos).toHaveLength(1);
  });

  it('(8) una sonda con 401 abre al instante aunque no haya 3 fallos', () => {
    const { compuerta, eventos } = nueva();
    expect(compuerta.reservarSonda(30 * MIN)).toBe(true);
    compuerta.registrarFallo(llave(), 'nexara-sonda', true);
    expect(compuerta.instantanea()).toMatchObject({ estado: 'caida', fallosSeguidos: 1 });
    expect(eventos).toEqual([
      { tipo: 'CAIDA', motivo: 'llave_puerta_invalida', desde: T0, detalle: '401 authentication_error', origen: 'sonda', fallos: 1 },
    ]);
  });

  it('(9) un solo CAIDA por episodio aunque sigan llegando fallos', () => {
    const { compuerta, eventos } = nueva();
    for (let i = 0; i < 3; i++) compuerta.registrarFallo(llave(), 'p', false, 1);
    // Llamadas que ya iban en camino cuando se abrió y fallan después.
    for (let i = 0; i < 10; i++) compuerta.registrarFallo(llave(), 'p', false, 1);
    compuerta.registrarFallo(clasificarFallo(error429('budget_exceeded')), 'p', false, 1);
    expect(eventos.filter((e) => e.tipo === 'CAIDA')).toHaveLength(1);
    // Ni suben la escalera: solo lo hace una sonda.
    expect(compuerta.instantanea()).toMatchObject({ fallosSeguidos: 3, proximoIntento: T0 + 5 * MIN, esperaActualMin: 5 });
  });

  it('(10) permite() solo mira: no consume el permiso de sonda', () => {
    const { compuerta, avanzar, fallaLlamada } = nueva();
    for (let i = 0; i < 3; i++) fallaLlamada(llave());
    avanzar(5 * MIN);
    for (let i = 0; i < 5; i++) expect(compuerta.permite()).toBe(true);
    expect(compuerta.instantanea().sondaEnVuelo).toBe(false);
    expect(compuerta.pedirPaso().esSonda).toBe(true);
  });

  it('(11) en modo observar nunca niega y sí cuenta y emite, con la misma máquina de estados', () => {
    const { compuerta, eventos, avanzar, fallaLlamada } = nueva('observar');
    for (let i = 0; i < 3; i++) fallaLlamada(llave());
    expect(eventos).toHaveLength(1);
    expect(compuerta.instantanea().estado).toBe('caida');
    // Antes del próximo intento: la llamada pasa igual (no es sonda).
    expect(compuerta.pedirPaso()).toEqual({ esSonda: false });
    expect(compuerta.pedirPaso()).toEqual({ esSonda: false });
    // Después: una lleva el permiso de sonda y las demás pasan sin él.
    avanzar(5 * MIN);
    expect(compuerta.pedirPaso()).toEqual({ esSonda: true });
    expect(compuerta.pedirPaso()).toEqual({ esSonda: false });
    // Un éxito la cierra y emite VOLVIO.
    compuerta.registrarBuena('p', 'claude-haiku-5-5', 1);
    expect(eventos.map((e) => e.tipo)).toEqual(['CAIDA', 'VOLVIO']);
  });

  it('(11) en modo apagado no cuenta, no emite y no niega', () => {
    const { compuerta, eventos, fallaLlamada } = nueva('apagado');
    for (let i = 0; i < 10; i++) fallaLlamada(llave());
    compuerta.registrarFallo(llave(), 'nexara-sonda', true);
    compuerta.registrarBuena('p', 'claude-haiku-5-5', 1);
    expect(eventos).toEqual([]);
    expect(compuerta.instantanea()).toMatchObject({ estado: 'ok', fallosSeguidos: 0, ultimaBuena: null });
    expect(compuerta.instantanea().hoy.filas).toEqual([]);
    expect(compuerta.permite()).toBe(true);
    expect(compuerta.pedirPaso()).toEqual({ esSonda: false });
    expect(compuerta.reservarSonda(30 * MIN)).toBe(false);
  });

  it('el modo se puede cambiar en caliente: un corte abierto en activo deja de negar al pasar a observar', () => {
    const { compuerta, fallaLlamada } = nueva('activo');
    for (let i = 0; i < 3; i++) fallaLlamada(llave());
    expect(() => compuerta.pedirPaso()).toThrow(IaNoDisponibleException);
    compuerta.modo = 'observar';
    expect(() => compuerta.pedirPaso()).not.toThrow();
  });

  it('una sonda que falla por otra causa (500, timeout) deja la caída como está y espera lo mismo otra vez', () => {
    const { compuerta, reloj, eventos, avanzar, fallaLlamada } = nueva();
    for (let i = 0; i < 3; i++) fallaLlamada(llave());
    avanzar(5 * MIN);
    const paso = compuerta.pedirPaso();
    compuerta.registrarFallo(clasificarFallo(error500()), 'p', paso.esSonda, 1);
    expect(compuerta.instantanea()).toMatchObject({ estado: 'caida', sondaEnVuelo: false, proximoIntento: reloj.t + 5 * MIN });
    expect(compuerta.permite()).toBe(false);
    expect(eventos).toHaveLength(1);
  });

  it('soltarSonda devuelve el permiso a quien no llegó a llamar', () => {
    const { compuerta, avanzar, fallaLlamada } = nueva();
    for (let i = 0; i < 3; i++) fallaLlamada(llave());
    avanzar(5 * MIN);
    expect(compuerta.pedirPaso().esSonda).toBe(true);
    expect(compuerta.permite()).toBe(false);
    compuerta.soltarSonda();
    expect(compuerta.permite()).toBe(true);
    expect(compuerta.pedirPaso().esSonda).toBe(true);
  });

  it('una sonda periódica en ok toca la primera vez y luego cada intervalo; en caída, al próximo intento y sin encimarse', () => {
    const { compuerta, avanzar } = nueva();
    expect(compuerta.reservarSonda(30 * MIN)).toBe(true);
    expect(compuerta.reservarSonda(30 * MIN)).toBe(false);
    avanzar(29 * MIN);
    expect(compuerta.reservarSonda(30 * MIN)).toBe(false);
    avanzar(1 * MIN);
    expect(compuerta.reservarSonda(30 * MIN)).toBe(true);

    // Cae por la sonda: ahora toca en 5 min, una sola a la vez.
    compuerta.registrarFallo(llave(), 'nexara-sonda', true);
    avanzar(4 * MIN);
    expect(compuerta.reservarSonda(30 * MIN)).toBe(false);
    avanzar(1 * MIN);
    expect(compuerta.reservarSonda(30 * MIN)).toBe(true);
    expect(compuerta.reservarSonda(30 * MIN)).toBe(false);
    // Una sonda que no vuelve en 30 s se da por colgada.
    avanzar(SONDA_COLGADA_MS);
    expect(compuerta.reservarSonda(30 * MIN)).toBe(true);
  });

  it('IA_CORTE_FALLOS y IA_CORTE_MINUTOS_MAX cambian el umbral y el tope de la escalera', () => {
    const previoFallos = process.env.IA_CORTE_FALLOS;
    const previoMinutos = process.env.IA_CORTE_MINUTOS_MAX;
    try {
      process.env.IA_CORTE_FALLOS = '2';
      process.env.IA_CORTE_MINUTOS_MAX = '10';
      const { compuerta, reloj, fallaLlamada } = nueva();
      fallaLlamada(llave());
      expect(compuerta.instantanea().estado).toBe('ok');
      fallaLlamada(llave());
      expect(compuerta.instantanea()).toMatchObject({ estado: 'caida', umbral: 2 });
      for (let i = 0; i < 4; i++) {
        reloj.t = compuerta.instantanea().proximoIntento!;
        compuerta.registrarFallo(llave(), 'p', compuerta.pedirPaso().esSonda, 1);
      }
      expect(compuerta.instantanea().esperaActualMin).toBe(10);
      // Valores sin sentido vuelven a la omisión.
      process.env.IA_CORTE_FALLOS = 'nada';
      process.env.IA_CORTE_MINUTOS_MAX = '-4';
      expect(nueva().compuerta.instantanea()).toMatchObject({ umbral: 3, esperaActualMin: 5 });
    } finally {
      if (previoFallos === undefined) delete process.env.IA_CORTE_FALLOS;
      else process.env.IA_CORTE_FALLOS = previoFallos;
      if (previoMinutos === undefined) delete process.env.IA_CORTE_MINUTOS_MAX;
      else process.env.IA_CORTE_MINUTOS_MAX = previoMinutos;
    }
  });

  it('un oyente que lanza no rompe la compuerta, y se puede dejar de escuchar', () => {
    const { compuerta, fallaLlamada } = nueva();
    const malo = jest.fn(() => {
      throw new Error('oyente roto');
    });
    const bueno = jest.fn();
    const dejar = compuerta.alCambiar(malo);
    compuerta.alCambiar(bueno);
    for (let i = 0; i < 3; i++) fallaLlamada(llave());
    expect(malo).toHaveBeenCalledTimes(1);
    expect(bueno).toHaveBeenCalledTimes(1);
    dejar();
    compuerta.registrarBuena('p', 'claude-haiku-5-5', 1);
    expect(malo).toHaveBeenCalledTimes(1);
    expect(bueno).toHaveBeenCalledTimes(2);
  });

  describe('cuenta del día en hora de México, por empresa y proceso', () => {
    it('cuenta llamadas, buenas, sin costo y otros, y no cuenta la sonda', () => {
      const { compuerta } = nueva();
      compuerta.registrarBuena('actas', 'claude-haiku-5-5', 1);
      compuerta.registrarBuena('actas', 'claude-haiku-5-5', 1);
      compuerta.registrarFallo(llave(), 'actas', false, 1);
      compuerta.registrarFallo(clasificarFallo(error500()), 'actas', false, 1);
      compuerta.registrarBuena('triage', 'claude-haiku-5-5', 2);
      compuerta.registrarBuena('nexara-sonda', 'claude-haiku-5-5');
      const { filas } = compuerta.contadoresDelDia();
      expect(filas).toEqual(
        expect.arrayContaining([
          { companyId: 1, proceso: 'actas', llamadas: 4, buenas: 2, sinCosto: 1, otros: 1 },
          { companyId: 2, proceso: 'triage', llamadas: 1, buenas: 1, sinCosto: 0, otros: 0 },
        ]),
      );
      expect(filas).toHaveLength(2);
    });

    it('el día cambia a la medianoche de México (06:00 UTC), no a las 18:00 de México', () => {
      const { compuerta, reloj } = nueva();
      reloj.t = Date.UTC(2026, 10, 28, 5, 59, 59); // 23:59:59 del 27-11 en México; ya es 28-11 en UTC
      compuerta.registrarBuena('p', 'm', 1);
      expect(compuerta.contadoresDelDia().dia).toBe('2026-11-27');
      reloj.t = Date.UTC(2026, 10, 28, 3, 0, 0); // 21:00 del 27-11 en México: sigue el mismo día
      compuerta.registrarBuena('p', 'm', 1);
      expect(compuerta.contadoresDelDia().filas[0].llamadas).toBe(2);
      reloj.t = Date.UTC(2026, 10, 28, 6, 0, 1); // 00:00:01 del 28-11 en México
      expect(compuerta.contadoresDelDia()).toEqual({ dia: '2026-11-28', filas: [] });
      compuerta.registrarBuena('p', 'm', 1);
      expect(compuerta.contadoresDelDia().filas[0].llamadas).toBe(1);
    });
  });

  it('la foto del estado trae lo último que salió bien y no se puede alterar por fuera', () => {
    const { compuerta } = nueva();
    compuerta.registrarBuena('actas', 'claude-haiku-5-5', 1);
    const foto = compuerta.instantanea();
    expect(foto.ultimaBuena).toEqual({ at: T0, proceso: 'actas', modelo: 'claude-haiku-5-5' });
    foto.hoy.filas.length = 0;
    expect(compuerta.contadoresDelDia().filas).toHaveLength(1);
  });
});
