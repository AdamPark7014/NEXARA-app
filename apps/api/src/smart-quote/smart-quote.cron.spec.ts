import { SmartQuoteCronService } from './smart-quote.cron';

function armar() {
  const jobs = { enqueue: jest.fn().mockResolvedValue({}) };
  const sync = { sync: jest.fn().mockResolvedValue({ status: 'OK' }) };
  return { jobs, sync, cron: new SmartQuoteCronService(jobs as never, sync as never) };
}

describe('SmartQuoteCronService', () => {
  const antes = { ...process.env };

  beforeEach(() => {
    process.env.CT_SYNC_ENABLED = '1';
    process.env.CT_FTP_USER = 'usuario';
    process.env.CT_FTP_PASSWORD = 'clave';
  });

  afterAll(() => {
    process.env = antes;
  });

  it('el JSON y el XML llevan cada uno su lugar único en la cola', async () => {
    const { cron, jobs } = armar();

    await cron.syncJson();
    await cron.syncXml();

    expect(jobs.enqueue).toHaveBeenNthCalledWith(1, 'supplier.ct.sync', { source: 'PRIMARY' }, { jobId: 'ct-sync-PRIMARY', unico: true, maxAttempts: 1 });
    expect(jobs.enqueue).toHaveBeenNthCalledWith(2, 'supplier.ct.sync', { source: 'FULL' }, { jobId: 'ct-sync-FULL', unico: true, maxAttempts: 1 });
  });

  it('sin la cola, el JSON corre directo', async () => {
    const { cron, jobs, sync } = armar();
    jobs.enqueue.mockRejectedValue(new Error('redis caído'));

    await cron.syncJson();

    expect(sync.sync).toHaveBeenCalledWith({ source: 'PRIMARY' });
  });

  it('apagado o sin credenciales no encola', async () => {
    const { cron, jobs } = armar();

    process.env.CT_SYNC_ENABLED = '0';
    await cron.syncJson();
    process.env.CT_SYNC_ENABLED = '1';
    delete process.env.CT_FTP_USER;
    await cron.syncXml();

    expect(jobs.enqueue).not.toHaveBeenCalled();
  });
});
