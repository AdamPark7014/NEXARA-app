import { Logger } from '@nestjs/common';
import { ResumenDiarioService } from '../../activities/resumen-diario.service';
import { AlertsService } from '../../alerts/alerts.service';
import { AttendanceCierreCronService } from '../../attendance/attendance-cierre.cron.service';
import { CotizacionesCoreService } from '../../cotizaciones/cotizaciones-core.service';
import { IntegraPushService } from '../../integra/integra-push.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SmartQuoteCronService } from '../../smart-quote/smart-quote.cron';
import { ToolRequestsCronService } from '../../tool-requests/tool-requests-cron.service';
import { AvisosRetrasoService } from '../../vehicles/avisos-retraso.service';
import { reiniciarCacheInterruptor } from '../../vehicles/interruptor-vehiculos';
import { WorkflowTimeoutCronService } from '../../workflow/workflow-timeout.cron';
import { CronService } from './cron.service';
import { latido, reiniciarLatido } from './latido-tareas';

/**
 * Tareas programadas ya envueltas: el método que lleva el `@Cron` deja latido (ok o error) y nunca propaga el fallo.
 * Una muestra de cada receta del cambio C1:
 *   S (cascarón sin try/catch)  → cierre de asistencia, herramientas, webhooks;
 *   B (decorador en método delgado) → CT JSON, cotizaciones vencidas, workflow, purga de INTEGRA;
 *   C (el cuerpo relanza el error) → alertas, avisos de cotizaciones, CT XML.
 * Los interruptores (RESUMEN_DIARIO, captura guiada de vehículos, servicio de webhooks) van DENTRO del trabajo: apagada,
 * la tarea no actúa pero sigue latiendo «ok», para que el vigilante no la dé por atrasada.
 * La cobertura de las 62 la da `tareas-catalogo.spec.ts`; aquí se comprueba que el envoltorio funciona de verdad.
 */

const estadoDe = (nombre: string) => latido.instantanea().find((e) => e.nombre === nombre);

/** Un servicio sin pasar por su constructor, con solo los campos que la prueba necesita. */
function conCampos<T>(clase: { prototype: T }, campos: Record<string, unknown>): T {
  return Object.assign(Object.create(clase.prototype as object), campos) as T;
}

describe('tareas envueltas dejan latido', () => {
  const antes = { ...process.env };
  let logError: jest.SpyInstance;

  beforeEach(() => {
    reiniciarLatido();
    delete process.env.NEXARA_RELEVO;
    process.env.CT_SYNC_ENABLED = '1';
    process.env.CT_FTP_USER = 'usuario';
    process.env.CT_FTP_PASSWORD = 'clave';
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...antes };
  });

  describe('receta S: el cuerpo corre dentro de runScheduledJob', () => {
    it('cierre de asistencia: ok cuando termina y error (sin propagar) cuando falla', async () => {
      const attendance = {
        cerrarJornadasOlvidadas: jest.fn().mockResolvedValue({ cerradas: 2 }),
        cerrarJornadasDeNocheOlvidadas: jest.fn().mockRejectedValue(new Error('base caída')),
      };
      const cron = new AttendanceCierreCronService(attendance as never);

      await cron.cerrarJornadasOlvidadas();
      await expect(cron.cerrarJornadasDeNocheOlvidadas()).resolves.toBeUndefined();

      expect(estadoDe('attendance-cierre-automatico')).toMatchObject({ ultimoResultado: 'ok', corridas: 1 });
      expect(estadoDe('attendance-cierre-noche')).toMatchObject({
        ultimoResultado: 'error',
        fallosSeguidos: 1,
        ultimoError: 'base caída',
      });
      expect(logError).toHaveBeenCalled();
    });

    it('con NEXARA_RELEVO=1 el cierre de noche no corre ni deja rastro', async () => {
      process.env.NEXARA_RELEVO = '1';
      const attendance = { cerrarJornadasDeNocheOlvidadas: jest.fn() };
      await new AttendanceCierreCronService(attendance as never).cerrarJornadasDeNocheOlvidadas();
      expect(attendance.cerrarJornadasDeNocheOlvidadas).not.toHaveBeenCalled();
      expect(estadoDe('attendance-cierre-noche')).toBeUndefined();
    });

    it('herramientas: las tres tareas dejan su latido, también con ceros', async () => {
      const servicio = {
        checkExpiringTools: jest.fn().mockResolvedValue(0),
        avisarKitsPorInspeccionarTodasLasEmpresas: jest.fn().mockResolvedValue(3),
        avisarPrestamosVencidos: jest.fn().mockRejectedValue(new Error('sin permiso')),
      };
      const cron = new ToolRequestsCronService(servicio as never);

      await cron.checkExpiringToolsDaily();
      await cron.avisarKitsPorInspeccionar();
      await cron.checkOverdueTools();

      expect(estadoDe('herramientas-por-vencer')?.ultimoResultado).toBe('ok');
      expect(estadoDe('kits-por-inspeccionar')?.ultimoResultado).toBe('ok');
      expect(estadoDe('herramientas-vencidas')).toMatchObject({ ultimoResultado: 'error', ultimoError: 'sin permiso' });
    });

    it('webhooks: sin el servicio no actúa pero sí late «ok»; con él registra ok', async () => {
      const armar = (webhooks?: unknown) =>
        new CronService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, webhooks as never);

      await armar().handleWebhookRetries();
      expect(estadoDe('webhook-retries')).toMatchObject({ ultimoResultado: 'ok', corridas: 1 });

      const webhooks = { processRetries: jest.fn().mockResolvedValue({ processed: 0 }) };
      await armar(webhooks).handleWebhookRetries();
      expect(webhooks.processRetries).toHaveBeenCalledWith(40);
      expect(estadoDe('webhook-retries')).toMatchObject({ ultimoResultado: 'ok', corridas: 2 });
    });

    it('avisos de unidad sin devolver: con el interruptor apagado no actúa pero late «ok»; prendido, actúa', async () => {
      reiniciarCacheInterruptor();
      const prisma = {
        systemSetting: { findFirst: jest.fn().mockResolvedValue(null) },
        vehicleControl: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const servicio = new AvisosRetrasoService(prisma as never, {} as never, {} as never);

      await servicio.correr();
      expect(prisma.vehicleControl.findMany).not.toHaveBeenCalled();
      expect(estadoDe('vehiculos-avisos-retraso')).toMatchObject({ ultimoResultado: 'ok', corridas: 1 });

      reiniciarCacheInterruptor();
      prisma.systemSetting.findFirst.mockResolvedValue({ id: 1 });
      const avisar = jest.spyOn(servicio, 'avisar').mockResolvedValue({ revisados: 0, avisos: 0 });
      await servicio.correr();
      expect(avisar).toHaveBeenCalledTimes(1);
      expect(estadoDe('vehiculos-avisos-retraso')).toMatchObject({ ultimoResultado: 'ok', corridas: 2 });
    });

    it('avisos de unidad sin devolver: con el interruptor prendido, un fallo del trabajo queda en el latido como error', async () => {
      reiniciarCacheInterruptor();
      const prisma = { systemSetting: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) } };
      const servicio = new AvisosRetrasoService(prisma as never, {} as never, {} as never);
      jest.spyOn(servicio, 'avisar').mockRejectedValue(new Error('base caída'));

      await expect(servicio.correr()).resolves.toBeUndefined();
      expect(estadoDe('vehiculos-avisos-retraso')).toMatchObject({ ultimoResultado: 'error', ultimoError: 'base caída' });
    });

    it('resumen diario: RESUMEN_DIARIO=0 no actúa pero late «ok»; el relevo ni corre ni deja rastro', async () => {
      const servicio = new ResumenDiarioService({} as never);
      const enviar = jest.spyOn(servicio, 'enviar').mockResolvedValue({ enviados: 0 } as never);

      process.env.RESUMEN_DIARIO = '0';
      await servicio.cron();
      expect(enviar).not.toHaveBeenCalled();
      expect(estadoDe('resumen-diario-direccion')).toMatchObject({ ultimoResultado: 'ok', corridas: 1 });

      delete process.env.RESUMEN_DIARIO;
      await servicio.cron();
      expect(enviar).toHaveBeenCalledTimes(1);
      expect(estadoDe('resumen-diario-direccion')).toMatchObject({ ultimoResultado: 'ok', corridas: 2 });

      reiniciarLatido();
      process.env.NEXARA_RELEVO = '1';
      await servicio.cron();
      expect(enviar).toHaveBeenCalledTimes(1);
      expect(estadoDe('resumen-diario-direccion')).toBeUndefined();
    });
  });

  describe('receta B: el método con @Cron es delgado y el original conserva su valor de retorno', () => {
    it('CT JSON: el método del @Cron registra ok y syncJson sigue siendo el trabajo', async () => {
      const jobs = { enqueue: jest.fn().mockResolvedValue({}) };
      const cron = new SmartQuoteCronService(jobs as never, { sync: jest.fn() } as never);

      await cron.cronSyncJson();

      expect(jobs.enqueue).toHaveBeenCalledTimes(1);
      expect(estadoDe('ct-catalog-json-sync')).toMatchObject({ ultimoResultado: 'ok', corridas: 1 });
    });

    it('cotizaciones vencidas: el @Cron registra ok y marcarVencidas sigue devolviendo el número', async () => {
      const prisma = { cotizacion: { findMany: jest.fn().mockResolvedValue([]) } };
      const servicio = new CotizacionesCoreService(prisma as never, {} as never);

      await expect(servicio.marcarVencidas(new Date('2026-11-18T12:00:00Z'))).resolves.toBe(0);
      await servicio.cronMarcarVencidas();

      expect(estadoDe('cotizaciones-vencidas')).toMatchObject({ ultimoResultado: 'ok', corridas: 1 });
    });

    it('workflow: ok sin instancias abiertas', async () => {
      const prisma = { workflowInstance: { findMany: jest.fn().mockResolvedValue([]) } };
      await new WorkflowTimeoutCronService(prisma as never, {} as never).cronTimeouts();
      expect(estadoDe('workflow-timeouts')?.ultimoResultado).toBe('ok');
    });

    it('purga de INTEGRA: el @Cron registra el éxito del trabajo y el original devuelve su conteo', async () => {
      const servicio = conCampos(IntegraPushService, {
        logger: new Logger('prueba'),
        purgeEvents: jest.fn().mockResolvedValue({ deleted: 5, photos: 1 }),
      });

      await expect(servicio.purgeOldEvents()).resolves.toEqual({ deleted: 5, photos: 1 });
      await servicio.cronPurgaDiaria();
      await servicio.cronPurgaRuido();

      expect(estadoDe('integra-purga-diaria')?.ultimoResultado).toBe('ok');
      expect(estadoDe('integra-purga-ruido')?.ultimoResultado).toBe('ok');
    });
  });

  describe('receta C: el cuerpo registra el error y lo relanza, para que el latido no diga ok', () => {
    it('alertas de margen: si la consulta falla, el latido dice error', async () => {
      const servicio = conCampos(AlertsService, {
        logger: new Logger('prueba'),
        prisma: { salesProject: { findMany: jest.fn().mockRejectedValue(new Error('sin conexión')) } },
      });

      await expect(servicio.cronAlertasMargen()).resolves.toBeUndefined();

      expect(estadoDe('alertas-margen')).toMatchObject({ ultimoResultado: 'error', ultimoError: 'sin conexión' });
    });

    it('las alertas siguen devolviendo el error cuando se llama el método con el cuerpo', async () => {
      const servicio = conCampos(AlertsService, {
        logger: new Logger('prueba'),
        prisma: { stockLevel: { findMany: jest.fn().mockRejectedValue(new Error('x')) } },
      });
      await expect(servicio.checkStockAlerts()).rejects.toThrow('x');
    });

    it('avisos de cotizaciones por vencer: error si falla la consulta, ok si no hay nada', async () => {
      const findMany = jest.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce([]);
      const servicio = conCampos(NotificationsService, {
        logger: new Logger('prueba'),
        prisma: { cotizacion: { findMany } },
      });

      await servicio.cronCotizacionesPorVencer();
      expect(estadoDe('cotizaciones-por-vencer')).toMatchObject({ ultimoResultado: 'error', fallosSeguidos: 1 });

      await servicio.cronCotizacionesPorVencer();
      expect(estadoDe('cotizaciones-por-vencer')).toMatchObject({ ultimoResultado: 'ok', fallosSeguidos: 0 });
    });

    it('CT XML: si no se puede encolar, el latido dice error (antes la tarea marcaba éxito)', async () => {
      const jobs = { enqueue: jest.fn().mockRejectedValue(new Error('redis caído')) };
      const cron = new SmartQuoteCronService(jobs as never, { sync: jest.fn() } as never);

      await cron.cronSyncXml();

      expect(estadoDe('ct-catalog-xml-sync')).toMatchObject({ ultimoResultado: 'error', ultimoError: 'redis caído' });
    });
  });
});
