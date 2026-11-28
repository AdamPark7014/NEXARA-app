import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS } from '../common/permissions';
import { RbacGuard } from '../common/rbac.guard';
import { ROLES } from '../common/rbac/roles.v2';
import { latido, reiniciarLatido, type EstadoTarea } from '../common/cron/latido-tareas';
import { runScheduledJob } from '../common/cron/run-scheduled-job';
import { TAREAS_CATALOGO, type TareaCatalogo } from '../common/cron/tareas-catalogo';
import { DETALLE_LATIDO_APAGADO, PulsoController, filasDeTareas } from './pulso.controller';

const MIN = 60_000;
const HORA = 60 * MIN;
const ARRANQUE = Date.UTC(2026, 10, 20, 0, 0, 0);
const AHORA = ARRANQUE + 10 * 24 * HORA;

const CAT: Record<string, TareaCatalogo> = {
  critica5: { cron: '*/5 * * * *', zona: 'UTC', grupo: 'g1', que: 'crítica cada 5 min', critica: true },
  diaria: { cron: '0 8 * * *', zona: 'MX', grupo: 'g2', que: 'diaria' },
  habiles: { cron: '0 8 * * 1-5', zona: 'MX', grupo: 'g2', que: 'de lunes a viernes' },
};

function estado(nombre: string, extra: Partial<EstadoTarea> = {}): EstadoTarea {
  return {
    nombre,
    corridas: 7,
    fallos: 1,
    saltadas: 2,
    ultimoInicio: AHORA - MIN,
    ultimoFin: AHORA - MIN + 1500,
    ultimoOk: AHORA - MIN + 1500,
    ultimoResultado: 'ok',
    ultimoError: null,
    duracionUltimaMs: 1500,
    duracionMaxMs: 4000,
    fallosSeguidos: 0,
    enCursoDesde: null,
    avisadoAt: null,
    sucio: false,
    recientes: [{ inicio: AHORA - MIN, ms: 1500, resultado: 'ok' }],
    ...extra,
  };
}

describe('GET /api/pulso/tareas', () => {
  const relevoAntes = process.env.NEXARA_RELEVO;

  beforeEach(() => {
    delete process.env.NEXARA_RELEVO;
    reiniciarLatido(Date.now());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (relevoAntes === undefined) delete process.env.NEXARA_RELEVO;
    else process.env.NEXARA_RELEVO = relevoAntes;
  });

  describe('permisos', () => {
    it('la ruta lleva RbacGuard y pide el permiso de administración de la consola', () => {
      const { tareas } = PulsoController.prototype;
      expect(Reflect.getMetadata(GUARDS_METADATA, PulsoController)).toContain(RbacGuard);
      expect(Reflect.getMetadata('rbac', tareas)).toEqual({ permissions: [PERMISSIONS.CONSOLE_ADMIN] });
      expect(Reflect.getMetadata('path', PulsoController)).toBe('pulso');
      expect(Reflect.getMetadata('path', tareas)).toBe('tareas');
    });

    /** El guardia de verdad, con la sesión (`AuthGuard('jwt')`) simulada como válida: lo que se prueba es la autorización. */
    async function pasa(user: Record<string, unknown> | undefined): Promise<boolean> {
      const guardia = new RbacGuard(new Reflector());
      const base = Object.getPrototypeOf(RbacGuard.prototype) as { canActivate: unknown };
      jest.spyOn(base as { canActivate: () => Promise<boolean> }, 'canActivate').mockResolvedValue(true);
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const contexto = {
        getHandler: () => PulsoController.prototype.tareas,
        getClass: () => PulsoController,
        switchToHttp: () => ({
          getRequest: () => ({ method: 'GET', originalUrl: '/api/pulso/tareas', url: '/api/pulso/tareas', user }),
        }),
      } as unknown as ExecutionContext;
      return guardia.canActivate(contexto);
    }

    it('sin CONSOLE_ADMIN responde 403', async () => {
      await expect(pasa({ id: 5, permissions: [] })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(pasa({ id: 5 })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un rol operativo (vendedor) tampoco entra', async () => {
      await expect(pasa({ id: 6, roleKey: ROLES.VENDEDOR, permissions: [] })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(pasa({ id: 6, roleKey: ROLES.VENDEDOR, vendedor: true })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('sin usuario en la petición responde 403', async () => {
      await expect(pasa(undefined)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('con el permiso de consola entra', async () => {
      await expect(pasa({ id: 1, permissions: [PERMISSIONS.CONSOLE_ADMIN] })).resolves.toBe(true);
    });

    it('el superadministrador entra', async () => {
      await expect(pasa({ id: 2, superadmin: true })).resolves.toBe(true);
    });
  });

  describe('filas', () => {
    it('devuelve una fila por cada tarea del catálogo, en el mismo orden', () => {
      const filas = new PulsoController().tareas();
      expect(filas.map((f) => f.nombre)).toEqual(Object.keys(TAREAS_CATALOGO));
      expect(filas.length).toBeGreaterThanOrEqual(62);
      expect(filas.find((f) => f.nombre === 'pulso:vigilante')).toMatchObject({ grupo: 'pulso', zona: 'UTC', cron: '*/5 * * * *' });
    });

    it('recién arrancado, todas salen «sin datos» (nunca roja por reinicio)', () => {
      const filas = new PulsoController().tareas();
      expect(filas.every((f) => f.estado === 'sin_datos')).toBe(true);
      expect(filas.every((f) => f.corridas === 0 && f.ultimoInicio === null && f.ultimoError === null)).toBe(true);
    });

    it('arma cada campo: catálogo, periodo en minutos, juicio y latido con fechas ISO', () => {
      const filas = filasDeTareas(
        [
          estado('critica5'),
          estado('diaria', {
            ultimoInicio: AHORA - 2 * HORA,
            ultimoFin: AHORA - 2 * HORA + 3000,
            ultimoOk: AHORA - 2 * HORA + 3000,
            enCursoDesde: AHORA - 30_000,
            avisadoAt: AHORA - HORA,
          }),
        ],
        CAT,
        AHORA,
        ARRANQUE,
      );
      expect(filas.map((f) => f.nombre)).toEqual(['critica5', 'diaria', 'habiles']);

      expect(filas[0]).toEqual({
        nombre: 'critica5',
        grupo: 'g1',
        que: 'crítica cada 5 min',
        critica: true,
        zona: 'UTC',
        cron: '*/5 * * * *',
        periodoMaxMin: 5,
        limiteMin: 10,
        estado: 'ok',
        detalle: 'Late bien.',
        corridas: 7,
        fallos: 1,
        saltadas: 2,
        ultimoInicio: new Date(AHORA - MIN).toISOString(),
        ultimoFin: new Date(AHORA - MIN + 1500).toISOString(),
        ultimoOk: new Date(AHORA - MIN + 1500).toISOString(),
        duracionUltimaMs: 1500,
        duracionMaxMs: 4000,
        fallosSeguidos: 0,
        ultimoError: null,
        enCursoDesde: null,
        avisadoAt: null,
      });

      expect(filas[1]).toMatchObject({
        critica: false,
        periodoMaxMin: 24 * 60,
        limiteMin: 48 * 60,
        estado: 'ok',
        enCursoDesde: new Date(AHORA - 30_000).toISOString(),
        avisadoAt: new Date(AHORA - HORA).toISOString(),
      });
      // De lunes a viernes: su hueco máximo es el fin de semana.
      expect(filas[2]).toMatchObject({ periodoMaxMin: 72 * 60, corridas: 0, ultimoInicio: null, duracionUltimaMs: null });
    });

    it('no expone el anillo de corridas recientes ni ningún campo fuera de la lista', () => {
      const [fila] = filasDeTareas([estado('critica5')], { critica5: CAT.critica5! }, AHORA, ARRANQUE);
      expect(fila).not.toHaveProperty('recientes');
      expect(fila).not.toHaveProperty('sucio');
      expect(Object.keys(fila!).sort()).toEqual(
        [
          'avisadoAt', 'corridas', 'critica', 'cron', 'detalle', 'duracionMaxMs', 'duracionUltimaMs', 'enCursoDesde', 'estado',
          'fallos', 'fallosSeguidos', 'grupo', 'limiteMin', 'nombre', 'periodoMaxMin', 'que', 'saltadas', 'ultimoError',
          'ultimoFin', 'ultimoInicio', 'ultimoOk', 'zona',
        ].sort(),
      );
    });

    it('distingue atrasada, atorada y fallando con una explicación en español', () => {
      const filas = filasDeTareas(
        [
          estado('critica5', { ultimoInicio: AHORA - 3 * HORA, ultimoFin: AHORA - 3 * HORA + 1000, ultimoOk: AHORA - 3 * HORA + 1000 }),
          estado('diaria', { enCursoDesde: AHORA - 3 * 24 * HORA }),
          estado('habiles', { fallosSeguidos: 3, ultimoResultado: 'error', ultimoError: 'ECONNREFUSED' }),
        ],
        CAT,
        AHORA,
        ARRANQUE,
      );
      expect(filas.map((f) => f.estado)).toEqual(['atrasada', 'atorada', 'fallando']);
      expect(filas[0]!.detalle).toContain('No arranca hace');
      expect(filas[1]!.detalle).toContain('sin terminar');
      expect(filas[2]!.detalle).toContain('3 veces seguidas');
    });

    it('con relevo todas salen «ok» con detalle «relevo»', () => {
      const filas = filasDeTareas([], CAT, AHORA, ARRANQUE, { relevo: true });
      expect(filas.every((f) => f.estado === 'ok' && f.detalle === 'relevo')).toBe(true);
      process.env.NEXARA_RELEVO = '1';
      expect(new PulsoController().tareas().every((f) => f.detalle === 'relevo')).toBe(true);
    });

    describe('con el latido apagado (PULSO_LATIDO=0)', () => {
      const latidoAntes = process.env.PULSO_LATIDO;
      afterEach(() => {
        if (latidoAntes === undefined) delete process.env.PULSO_LATIDO;
        else process.env.PULSO_LATIDO = latidoAntes;
      });

      it('ninguna sale «atrasada»: todas «sin datos» y el detalle explica que el latido está apagado', () => {
        // Sin la opción, sin rastro y pasado su límite, estas tareas saldrían «atrasadas».
        const juzgadas = filasDeTareas([], CAT, AHORA, ARRANQUE);
        expect(juzgadas.every((f) => f.estado === 'atrasada')).toBe(true);

        const filas = filasDeTareas([], CAT, AHORA, ARRANQUE, { latidoApagado: true });
        expect(filas.map((f) => f.nombre)).toEqual(['critica5', 'diaria', 'habiles']);
        expect(filas.every((f) => f.estado === 'sin_datos')).toBe(true);
        expect(filas.every((f) => f.detalle === DETALLE_LATIDO_APAGADO)).toBe(true);
        expect(DETALLE_LATIDO_APAGADO).toContain('latido está apagado');
      });

      it('tampoco acusa de «fallando» o «atorada» a una tarea con historial viejo; los datos se siguen mostrando', () => {
        const [fila] = filasDeTareas(
          [estado('critica5', { fallosSeguidos: 3, ultimoError: 'ECONNREFUSED', enCursoDesde: AHORA - 3 * HORA })],
          { critica5: CAT.critica5! },
          AHORA,
          ARRANQUE,
          { latidoApagado: true },
        );
        expect(fila).toMatchObject({ estado: 'sin_datos', detalle: DETALLE_LATIDO_APAGADO, fallosSeguidos: 3, corridas: 7 });
        expect(fila!.ultimoError).toBe('ECONNREFUSED');
      });

      it('el relevo manda: sigue diciendo «relevo»', () => {
        const filas = filasDeTareas([], CAT, AHORA, ARRANQUE, { relevo: true, latidoApagado: true });
        expect(filas.every((f) => f.estado === 'ok' && f.detalle === 'relevo')).toBe(true);
      });

      it('el endpoint lee PULSO_LATIDO en cada consulta', () => {
        // Recién arrancado el proceso (reiniciarLatido(Date.now())): «sin datos» de todos modos; lo que cambia es el detalle.
        process.env.PULSO_LATIDO = '0';
        const apagado = new PulsoController().tareas();
        expect(apagado.every((f) => f.estado === 'sin_datos' && f.detalle === DETALLE_LATIDO_APAGADO)).toBe(true);

        delete process.env.PULSO_LATIDO;
        const encendido = new PulsoController().tareas();
        expect(encendido.every((f) => f.detalle !== DETALLE_LATIDO_APAGADO)).toBe(true);
      });

      it('con el proceso viejo y sin rastro, el endpoint no dice «atrasada» si el latido está apagado', () => {
        reiniciarLatido(Date.now() - 400 * 24 * HORA); // el proceso lleva más de un año arriba
        const encendido = new PulsoController().tareas();
        expect(encendido.some((f) => f.estado === 'atrasada')).toBe(true);

        process.env.PULSO_LATIDO = '0';
        const apagado = new PulsoController().tareas();
        expect(apagado.some((f) => f.estado === 'atrasada')).toBe(false);
        expect(apagado.every((f) => f.estado === 'sin_datos')).toBe(true);
      });
    });
  });

  describe('privacidad del ultimoError', () => {
    it('lo que sale del latido ya viene saneado: un correo no sale', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const logger = new Logger('prueba');
      for (let i = 0; i < 3; i += 1) {
        await runScheduledJob('kpi-snapshot', logger, async () => {
          throw new Error('No se pudo avisar a ana.perez@empresa.com (cuenta 5512345678901)');
        });
      }
      const fila = new PulsoController().tareas().find((f) => f.nombre === 'kpi-snapshot')!;
      expect(fila.estado).toBe('fallando');
      expect(fila.fallosSeguidos).toBe(3);
      expect(fila.ultimoError).toBe('No se pudo avisar a [correo] (cuenta #)');
      expect(JSON.stringify(fila)).not.toContain('ana.perez');
      expect(JSON.stringify(fila)).not.toContain('5512345678901');
      // También el detalle que explica el estado.
      expect(fila.detalle).not.toContain('@');
    });

    it('si el estado trae un texto sin sanear (historial de la base), el controlador también lo limpia', () => {
      const [fila] = filasDeTareas(
        [estado('critica5', { ultimoError: 'falló con luis@empresa.com y el token Bearer abc.def.ghi', fallosSeguidos: 3 })],
        { critica5: CAT.critica5! },
        AHORA,
        ARRANQUE,
      );
      expect(fila!.estado).toBe('fallando');
      expect(fila!.ultimoError).toBe('falló con [correo] y el token Bearer [token]');
      // El detalle que explica el estado cita el mismo error y también sale limpio.
      expect(fila!.detalle).toContain('[correo]');
      expect(JSON.stringify(fila)).not.toContain('luis@empresa.com');
    });

    it('el catálogo real del latido se puede serializar a JSON', () => {
      latido.inicio('kpi-snapshot');
      latido.fin('kpi-snapshot', 'ok', 20);
      const json = JSON.stringify(new PulsoController().tareas());
      expect(JSON.parse(json)).toHaveLength(Object.keys(TAREAS_CATALOGO).length);
    });
  });
});
