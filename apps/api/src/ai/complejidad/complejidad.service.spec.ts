import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ComplejidadService, MENSAJE_SIN_IA, MENSAJE_SIN_RESPUESTA } from './complejidad.service.js';
import { IaNoDisponibleException } from '../claude/compuerta-ia.js';

const TITULO = 'Instalar 4 cámaras en recepción';

function armar(opts: { disponible?: boolean } = {}) {
  const claude = {
    disponible: jest.fn().mockReturnValue(opts.disponible ?? true),
    json: jest.fn().mockResolvedValue({
      datos: { complejidad: 'ESTANDAR', motivo: '  Cuatro cámaras   en un sitio ', cantidad: 4, destino: null },
    }),
  };
  const svc = new ComplejidadService({} as never, claude as never);
  return { svc, claude };
}

const caida = () => new IaNoDisponibleException('La IA no está disponible por ahora: ya se avisó al administrador.', 'llave_puerta_invalida', true);

describe('ComplejidadService.sugerir', () => {
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('un título de 5 caracteres no es un fallo: disponible, motivo titulo_corto, sin mensaje y sin llamar a la IA', async () => {
    const { svc, claude } = armar();
    const r = await svc.sugerir(1, { titulo: ' Cable' });
    expect(r).toEqual({ sugerencia: null, disponible: true, motivo: 'titulo_corto' });
    expect(r).not.toHaveProperty('mensaje');
    expect(claude.json).not.toHaveBeenCalled();
    expect(claude.disponible).not.toHaveBeenCalled();
  });

  it('un título corto sigue siendo título_corto aunque la IA no esté (no se le echa la culpa a la IA)', async () => {
    const { svc, claude } = armar({ disponible: false });
    expect(await svc.sugerir(1, { titulo: 'abc' })).toEqual({ sugerencia: null, disponible: true, motivo: 'titulo_corto' });
    expect(claude.json).not.toHaveBeenCalled();
  });

  it('con la IA sin llave o cortada (disponible() falso) dice por qué y no llama a claude.json', async () => {
    const { svc, claude } = armar({ disponible: false });
    const r = await svc.sugerir(1, { titulo: TITULO });
    expect(r).toEqual({ sugerencia: null, disponible: false, motivo: 'ia_no_disponible', mensaje: MENSAJE_SIN_IA });
    expect(r.mensaje).toBe('Sugerencia no disponible por ahora: elige tú el nivel.');
    expect(claude.json).not.toHaveBeenCalled();
  });

  it('un 503 de IA (IaNoDisponibleException) responde lo mismo, sin pegar el texto técnico, y avisa UNA vez en el log', async () => {
    const { svc, claude } = armar();
    claude.json.mockRejectedValue(caida());
    for (let i = 0; i < 5; i++) {
      const r = await svc.sugerir(1, { titulo: TITULO });
      expect(r).toEqual({ sugerencia: null, disponible: false, motivo: 'ia_no_disponible', mensaje: MENSAJE_SIN_IA });
    }
    expect(claude.json).toHaveBeenCalledTimes(5);
    // Un solo aviso para las cinco, no un warn por llamada.
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('cuando la IA vuelve se anota una vez y, si se cae otra vez, se avisa otra vez', async () => {
    const { svc, claude } = armar();
    claude.json.mockRejectedValueOnce(caida()).mockRejectedValueOnce(caida());
    await svc.sugerir(1, { titulo: TITULO });
    await svc.sugerir(1, { titulo: TITULO });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();

    const buena = await svc.sugerir(1, { titulo: TITULO });
    expect(buena.disponible).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    await svc.sugerir(1, { titulo: TITULO });
    expect(log).toHaveBeenCalledTimes(1);

    claude.json.mockRejectedValueOnce(caida());
    await svc.sugerir(1, { titulo: TITULO });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('un error cualquiera (formato inesperado, fallo de red) es sin_respuesta: la IA está, esta vez no contestó', async () => {
    for (const error of [new ServiceUnavailableException('La IA respondió en un formato inesperado: intenta de nuevo.'), new Error('boom')]) {
      const { svc, claude } = armar();
      claude.json.mockRejectedValue(error);
      const r = await svc.sugerir(1, { titulo: TITULO });
      expect(r).toEqual({ sugerencia: null, disponible: true, motivo: 'sin_respuesta', mensaje: MENSAJE_SIN_RESPUESTA });
      expect(r.mensaje).toBe('No pude sugerir esta vez: elige tú el nivel.');
      // No se pega el texto del error en lo que ve la persona.
      expect(JSON.stringify(r)).not.toContain('boom');
      expect(JSON.stringify(r)).not.toContain('formato inesperado');
    }
  });

  it('éxito: disponible y la sugerencia limpia, sin motivo ni mensaje', async () => {
    const { svc, claude } = armar();
    const r = await svc.sugerir(1, { coreKind: 'tarea', tipo: 'Instalación', titulo: TITULO });
    expect(r).toEqual({
      sugerencia: { complejidad: 'ESTANDAR', motivo: 'Cuatro cámaras en un sitio', cantidad: 4, destino: null },
      disponible: true,
    });
    expect(r).not.toHaveProperty('motivo');
    expect(r).not.toHaveProperty('mensaje');
    expect(claude.json).toHaveBeenCalledTimes(1);
    expect(claude.json.mock.calls[0][0]).toMatchObject({ proceso: 'complejidad', companyId: 1 });
  });

  it('la IA contesta pero con un nivel inválido: no queda en hueco, dice sin_respuesta', async () => {
    const { svc, claude } = armar();
    claude.json.mockResolvedValue({ datos: { complejidad: 'ENORME', motivo: 'x', cantidad: null, destino: null } });
    const r = await svc.sugerir(1, { titulo: TITULO });
    expect(r).toEqual({ sugerencia: null, disponible: true, motivo: 'sin_respuesta', mensaje: MENSAJE_SIN_RESPUESTA });
  });

  it('el tercer parámetro cambia el x-proceso (el relleno usa complejidad-relleno); sin él sigue siendo complejidad', async () => {
    const { svc, claude } = armar();
    await svc.sugerir(1, { titulo: TITULO }, { proceso: 'complejidad-relleno' });
    expect(claude.json.mock.calls[0][0].proceso).toBe('complejidad-relleno');
    await svc.sugerir(1, { titulo: TITULO }, {});
    expect(claude.json.mock.calls[1][0].proceso).toBe('complejidad');
  });
});
