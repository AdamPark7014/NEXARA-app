import { Logger } from '@nestjs/common';
import { runScheduledJob } from './run-scheduled-job.js';

function fakeLogger() {
  const errors: string[] = [];
  const debugs: string[] = [];
  const logger = {
    error: (msg: string) => errors.push(msg),
    debug: (msg: string) => debugs.push(msg),
  } as unknown as Logger;
  return { logger, errors, debugs };
}

describe('runScheduledJob', () => {
  it('ejecuta la tarea y registra la duración', async () => {
    const { logger, debugs, errors } = fakeLogger();
    const job = jest.fn().mockResolvedValue('ok');

    await runScheduledJob('kpi-snapshot', logger, job);

    expect(job).toHaveBeenCalled();
    expect(errors).toHaveLength(0);
    expect(debugs[0]).toContain('kpi-snapshot');
  });

  it('no propaga el fallo: la siguiente ejecución debe programarse igual', async () => {
    const { logger } = fakeLogger();
    const job = jest.fn().mockRejectedValue(new Error('base de datos caída'));

    // Si esto lanzara, acabaría como unhandledRejection anónimo.
    await expect(runScheduledJob('overdue-invoices', logger, job)).resolves.toBeUndefined();
  });

  it('atribuye el fallo a su tarea concreta', async () => {
    const { logger, errors } = fakeLogger();

    await runScheduledJob('sla-breach-escalate', logger, () =>
      Promise.reject(new Error('timeout de consulta')),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('sla-breach-escalate');
    expect(errors[0]).toContain('timeout de consulta');
  });

  it('tolera valores lanzados que no son Error', async () => {
    const { logger, errors } = fakeLogger();

    await runScheduledJob('webhook-retries', logger, () => Promise.reject('fallo suelto'));

    expect(errors[0]).toContain('fallo suelto');
  });
});
