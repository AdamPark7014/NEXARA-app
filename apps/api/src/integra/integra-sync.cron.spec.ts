import type { PrismaService } from '../prisma/prisma.service.js';
import type { IntegraSiteService } from './integra-site.service';
import { IntegraSyncService } from './integra-sync.service';

/**
 * La reconciliación del espejo, ya sin botón.
 *
 * Lo que antes esperaba a que alguien pulsara «Reconciliar» ahora corre cada
 * quince minutos. Eso son quince minutos de oportunidad para hacer daño: dos
 * vueltas solapadas escribiendo el mismo espejo, o un sitio caído recibiendo un
 * intento fallido cada cuarto de hora hasta el lunes. Aquí se prueban los tres
 * frenos, sin base y sin red.
 */

const SITIO_A = { id: 7, companyId: 4242 };
const SITIO_B = { id: 9, companyId: 4242 };

function escenario(sitios = [SITIO_A, SITIO_B]) {
  const prisma = {
    integraSite: { findMany: jest.fn(async () => sitios) },
  } as unknown as PrismaService;
  const sites = {} as unknown as IntegraSiteService;
  const svc = new IntegraSyncService(prisma, sites);
  const syncSite = jest
    .spyOn(svc, 'syncSite')
    .mockImplementation(async () => ({}) as Awaited<ReturnType<IntegraSyncService['syncSite']>>);
  return { svc, prisma, syncSite };
}

describe('IntegraSyncService · reconciliación periódica', () => {
  afterEach(() => {
    delete process.env.INTEGRA_SYNC_CRON;
    jest.restoreAllMocks();
  });

  it('reconcilia todos los sitios activos', async () => {
    const { svc, syncSite } = escenario();

    const out = await svc.reconciliarSitiosActivos();

    expect(out).toMatchObject({ ejecutado: true, sitios: 2, ok: 2, fallos: 0, pospuestos: 0 });
    expect(syncSite).toHaveBeenCalledWith(4242, 7);
    expect(syncSite).toHaveBeenCalledWith(4242, 9);
  });

  it('apagado por entorno: ni una consulta', async () => {
    process.env.INTEGRA_SYNC_CRON = '0';
    const { svc, prisma, syncSite } = escenario();

    const out = await svc.reconciliarSitiosActivos();

    expect(out).toMatchObject({ ejecutado: false, razon: 'apagado' });
    expect(prisma.integraSite.findMany).not.toHaveBeenCalled();
    expect(syncSite).not.toHaveBeenCalled();
  });

  it('guardia: la vuelta que se alarga no deja entrar a la siguiente', async () => {
    // Drenar páginas de personas y tarjetas de cada terminal puede pasar de los
    // quince minutos del cron. Dos vueltas a la vez son dos escrituras del
    // mismo espejo y dos peticiones al mismo equipo.
    const { svc, syncSite } = escenario([SITIO_A]);
    let soltar: (() => void) | null = null;
    syncSite.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          soltar = () => resolve({} as Awaited<ReturnType<IntegraSyncService['syncSite']>>);
        }),
    );

    const primera = svc.reconciliarSitiosActivos();
    const segunda = await svc.reconciliarSitiosActivos();

    expect(segunda).toMatchObject({ ejecutado: false, razon: 'ya-en-curso' });
    expect(syncSite).toHaveBeenCalledTimes(1);

    (soltar as unknown as () => void)();
    await expect(primera).resolves.toMatchObject({ ejecutado: true, ok: 1 });
  });

  it('tras terminar, el guardia se suelta', async () => {
    const { svc } = escenario([SITIO_A]);
    await svc.reconciliarSitiosActivos();
    await expect(svc.reconciliarSitiosActivos()).resolves.toMatchObject({ ejecutado: true });
  });

  it('un sitio que falla no corta la vuelta de los demás', async () => {
    const { svc, syncSite } = escenario();
    syncSite.mockImplementationOnce(async () => {
      throw new Error('NVR apagado');
    });

    const out = await svc.reconciliarSitiosActivos();

    expect(out).toMatchObject({ sitios: 2, ok: 1, fallos: 1 });
    expect(syncSite).toHaveBeenCalledTimes(2);
  });

  it('un sitio caído se aparta y no se aporrea cada cuarto de hora', async () => {
    const ahora = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const { svc, syncSite } = escenario([SITIO_A]);
    syncSite.mockImplementation(async () => {
      throw new Error('VPN caída');
    });

    // Primer fallo: se aparta una vuelta entera (15 min).
    await svc.reconciliarSitiosActivos();
    expect(syncSite).toHaveBeenCalledTimes(1);

    // La vuelta siguiente ni lo intenta.
    ahora.mockReturnValue(1_700_000_000_000 + 15 * 60_000 - 1);
    const pospuesta = await svc.reconciliarSitiosActivos();
    expect(pospuesta).toMatchObject({ ejecutado: true, pospuestos: 1, fallos: 0 });
    expect(syncSite).toHaveBeenCalledTimes(1);

    // Pasada la espera vuelve a intentarlo —y al fallar otra vez, la espera se
    // dobla: 15 → 30 min. Un sitio caído se sigue reintentando, sin prisa.
    ahora.mockReturnValue(1_700_000_000_000 + 16 * 60_000);
    await svc.reconciliarSitiosActivos();
    expect(syncSite).toHaveBeenCalledTimes(2);

    ahora.mockReturnValue(1_700_000_000_000 + 16 * 60_000 + 29 * 60_000);
    const segundaPospuesta = await svc.reconciliarSitiosActivos();
    expect(segundaPospuesta.pospuestos).toBe(1);
    expect(syncSite).toHaveBeenCalledTimes(2);
  });

  it('cuando el sitio vuelve, se le olvida el castigo', async () => {
    const ahora = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const { svc, syncSite } = escenario([SITIO_A]);
    syncSite.mockImplementationOnce(async () => {
      throw new Error('NVR apagado');
    });

    await svc.reconciliarSitiosActivos();
    ahora.mockReturnValue(1_700_000_000_000 + 16 * 60_000);
    await svc.reconciliarSitiosActivos(); // esta sale bien

    // Y la siguiente vuelta entra sin esperar nada.
    ahora.mockReturnValue(1_700_000_000_000 + 17 * 60_000);
    const out = await svc.reconciliarSitiosActivos();
    expect(out).toMatchObject({ ok: 1, pospuestos: 0 });
    expect(syncSite).toHaveBeenCalledTimes(3);
  });

  it('el cron no propaga el fallo: lo anota y deja programada la siguiente', async () => {
    const { svc, prisma } = escenario();
    (prisma.integraSite.findMany as unknown as jest.Mock).mockRejectedValueOnce(
      new Error('base caída'),
    );

    await expect(svc.cronSyncAll()).resolves.toBeUndefined();
  });
});
