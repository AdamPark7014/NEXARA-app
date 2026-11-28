import { AuditController } from './audit.controller';
import type { AuditService } from './audit.service';

/**
 * `POST /audit/purge` ya no inventa 365 días: sin `days` rige la retención configurada (`audit-retencion.ts`) y con
 * `days` manda ese número. Esta prueba fija que el controlador no vuelva a poner una omisión propia.
 */
describe('AuditController.purge', () => {
  function armar() {
    const purgeOlderThan = jest.fn(async (_days?: number | string | null) => ({ deleted: 0 }));
    const controller = new AuditController({ purgeOlderThan } as unknown as AuditService);
    return { controller, purgeOlderThan };
  }

  it('sin days se lo pasa vacío al servicio (rige la retención configurada, no 365)', async () => {
    const { controller, purgeOlderThan } = armar();
    await controller.purge();
    expect(purgeOlderThan).toHaveBeenCalledTimes(1);
    expect(purgeOlderThan).toHaveBeenCalledWith(undefined);
  });

  it('con days se lo pasa tal cual (el servicio decide el piso y si es válido)', async () => {
    const { controller, purgeOlderThan } = armar();
    await controller.purge(45);
    expect(purgeOlderThan).toHaveBeenCalledWith(45);
  });
});
