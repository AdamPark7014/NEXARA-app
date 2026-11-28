import { Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  MAX_SUGERENCIAS_IA_POR_DIA,
  MAX_SUGERENCIAS_IA_POR_MINUTO,
  PolizaPropuestaService,
} from './poliza-propuesta.service.js';
import { IaNoDisponibleException } from '../../ai/claude/compuerta-ia.js';
import { CUENTAS } from '../mesa-contable/polizas-mesa.js';

const FACTURA = {
  id: 55,
  companyId: 7,
  type: 'ACCOUNTS_PAYABLE',
  totalAmount: 1160,
  taxAmount: 160,
  ivaRetenido: null,
  isrRetenido: null,
  emisorRfc: 'AAA010101AAA',
  emisorName: 'Papelería Uno',
  notes: 'Hojas y plumas',
  issueDate: new Date('2026-11-10T12:00:00Z'),
};

function armar(opts: { regla?: unknown; disponible?: boolean } = {}) {
  const prisma = {
    invoice: { findFirst: jest.fn().mockResolvedValue(FACTURA) },
    proveedorContabilizacionRegla: { findUnique: jest.fn().mockResolvedValue(opts.regla ?? null) },
    viaticoTicket: { findMany: jest.fn().mockResolvedValue([]) },
    purchaseOrder: { findMany: jest.fn().mockResolvedValue([]) },
    activity: { findFirst: jest.fn().mockResolvedValue(null) },
    polizaPropuesta: { upsert: jest.fn().mockImplementation(async (args: { create: unknown }) => args.create) },
  };
  const claude = {
    disponible: jest.fn().mockReturnValue(opts.disponible ?? true),
    json: jest.fn().mockResolvedValue({ datos: { codigo: '601.02', porque: 'Viáticos del equipo.' } }),
  };
  const svc = new PolizaPropuestaService(prisma as never, claude as never, {} as never);
  return { svc, prisma, claude };
}

describe('PolizaPropuestaService.proponerParaInvoice con IA', () => {
  it('si la IA no responde la propuesta queda en confianza «baja» con «Sin historial ni IA…», no con una cuenta de IA inventada', async () => {
    for (const error of [
      new IaNoDisponibleException('La IA no está disponible por ahora: ya se avisó al administrador.', 'llave_puerta_invalida', true),
      new ServiceUnavailableException('La IA respondió en un formato inesperado: intenta de nuevo.'),
      new Error('boom'),
    ]) {
      const { svc, claude } = armar();
      claude.json.mockRejectedValue(error);
      const p = (await svc.proponerParaInvoice(7, 55)) as unknown as { confianza: string; explicacion: string; cuentaGastoCodigo: string };
      expect(claude.json).toHaveBeenCalledTimes(1);
      expect(p.confianza).toBe('baja');
      expect(p.explicacion).toMatch(/^Sin historial ni IA/);
      expect(p.explicacion).not.toMatch(/Haiku/);
      expect(p.cuentaGastoCodigo).toBe(CUENTAS.gastosAdministracion);
    }
  });

  it('con IA que responde queda en «media» con la cuenta y el porqué de la IA', async () => {
    const { svc, claude } = armar();
    const p = (await svc.proponerParaInvoice(7, 55)) as unknown as { confianza: string; explicacion: string; cuentaGastoCodigo: string };
    expect(p.confianza).toBe('media');
    expect(p.cuentaGastoCodigo).toBe('601.02');
    expect(p.explicacion).toBe('Viáticos del equipo.');
    expect(claude.json).toHaveBeenCalledTimes(1);
  });

  it('el proceso contadora-poliza se manda con el companyId real de la factura, no con 0', async () => {
    const { svc, claude } = armar();
    await svc.proponerParaInvoice(7, 55);
    expect(claude.json.mock.calls[0][0]).toMatchObject({ proceso: 'contadora-poliza', companyId: 7 });
    expect(claude.json.mock.calls[0][0].companyId).not.toBe(0);
  });

  it('una respuesta de la IA sin código tampoco inventa una cuenta: queda «baja»', async () => {
    const { svc, claude } = armar();
    claude.json.mockResolvedValue({ datos: { codigo: '  ', porque: 'x' } });
    const p = (await svc.proponerParaInvoice(7, 55)) as unknown as { confianza: string; explicacion: string };
    expect(p.confianza).toBe('baja');
    expect(p.explicacion).toMatch(/^Sin historial ni IA/);
  });

  it('con la IA fuera (disponible() falso) no se le pregunta y queda «baja»', async () => {
    const { svc, claude } = armar({ disponible: false });
    const p = (await svc.proponerParaInvoice(7, 55)) as unknown as { confianza: string };
    expect(claude.json).not.toHaveBeenCalled();
    expect(p.confianza).toBe('baja');
  });

  it('con una regla aprendida del proveedor no se llama a la IA y queda «alta»', async () => {
    const { svc, claude } = armar({ regla: { cuentaCodigo: '601.01', centroCosto: null } });
    const p = (await svc.proponerParaInvoice(7, 55)) as unknown as { confianza: string; cuentaGastoCodigo: string };
    expect(claude.json).not.toHaveBeenCalled();
    expect(p.confianza).toBe('alta');
    expect(p.cuentaGastoCodigo).toBe('601.01');
  });
});

describe('PolizaPropuestaService: freno de sugerencias de IA (no vaciar el cupo de la empresa)', () => {
  // Mediodía de México (UTC-6, sin horario de verano): lejos de cualquier cambio de día.
  const T0 = Date.parse('2026-11-20T18:00:00Z');
  let ahora = T0;
  let avisos: jest.SpyInstance;

  type Propuesta = { confianza: string; explicacion: string };
  const proponer = async (svc: PolizaPropuestaService, companyId = 7) =>
    (await svc.proponerParaInvoice(companyId, 55)) as unknown as Propuesta;

  beforeEach(() => {
    ahora = T0;
    jest.spyOn(Date, 'now').mockImplementation(() => ahora);
    avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('una descarga masiva pide a la IA solo hasta el tope por minuto; el resto queda «baja» sin llamarla', async () => {
    const { svc, claude } = armar();
    const confianzas: string[] = [];
    for (let i = 0; i < MAX_SUGERENCIAS_IA_POR_MINUTO + 15; i += 1) confianzas.push((await proponer(svc)).confianza);

    expect(claude.json).toHaveBeenCalledTimes(MAX_SUGERENCIAS_IA_POR_MINUTO);
    expect(confianzas.slice(0, MAX_SUGERENCIAS_IA_POR_MINUTO).every((c) => c === 'media')).toBe(true);
    expect(confianzas.slice(MAX_SUGERENCIAS_IA_POR_MINUTO).every((c) => c === 'baja')).toBe(true);
  });

  it('las que pasan el tope quedan con «Sin historial ni IA…» y la propuesta se guarda igual (no se pierde la factura)', async () => {
    const { svc, prisma } = armar();
    for (let i = 0; i < MAX_SUGERENCIAS_IA_POR_MINUTO; i += 1) await proponer(svc);
    const p = await proponer(svc);
    expect(p.explicacion).toMatch(/^Sin historial ni IA/);
    expect(prisma.polizaPropuesta.upsert).toHaveBeenCalledTimes(MAX_SUGERENCIAS_IA_POR_MINUTO + 1);
  });

  it('pasado el minuto la IA vuelve a estar disponible para la póliza', async () => {
    const { svc, claude } = armar();
    for (let i = 0; i < MAX_SUGERENCIAS_IA_POR_MINUTO + 5; i += 1) await proponer(svc);
    expect(claude.json).toHaveBeenCalledTimes(MAX_SUGERENCIAS_IA_POR_MINUTO);

    ahora += 61_000;
    expect((await proponer(svc)).confianza).toBe('media');
    expect(claude.json).toHaveBeenCalledTimes(MAX_SUGERENCIAS_IA_POR_MINUTO + 1);
  });

  it('tope por día: la póliza nunca se lleva más de su parte del cupo, aunque cada minuto sea tranquilo', async () => {
    const { svc, claude } = armar();
    // Una tanda por minuto, sin llegar nunca al tope por minuto, hasta pasar el tope del día.
    const porTanda = 10;
    for (let i = 0; i < Math.ceil(MAX_SUGERENCIAS_IA_POR_DIA / porTanda) + 2; i += 1) {
      for (let j = 0; j < porTanda; j += 1) await proponer(svc);
      ahora += 61_000;
    }
    expect(claude.json).toHaveBeenCalledTimes(MAX_SUGERENCIAS_IA_POR_DIA);
    expect((await proponer(svc)).confianza).toBe('baja');
    expect(claude.json).toHaveBeenCalledTimes(MAX_SUGERENCIAS_IA_POR_DIA);
  });

  it('al día siguiente (día de México) el tope diario empieza de cero', async () => {
    const { svc, claude } = armar();
    for (let i = 0; i < Math.ceil(MAX_SUGERENCIAS_IA_POR_DIA / 10) + 2; i += 1) {
      for (let j = 0; j < 10; j += 1) await proponer(svc);
      ahora += 61_000;
    }
    expect(claude.json).toHaveBeenCalledTimes(MAX_SUGERENCIAS_IA_POR_DIA);

    ahora = T0 + 24 * 3_600_000;
    expect((await proponer(svc)).confianza).toBe('media');
    expect(claude.json).toHaveBeenCalledTimes(MAX_SUGERENCIAS_IA_POR_DIA + 1);
  });

  it('el freno es por empresa: una empresa saturada no le quita la IA a otra', async () => {
    const { svc, claude } = armar();
    for (let i = 0; i < MAX_SUGERENCIAS_IA_POR_MINUTO + 5; i += 1) await proponer(svc, 7);
    expect((await proponer(svc, 7)).confianza).toBe('baja');

    expect((await proponer(svc, 8)).confianza).toBe('media');
    expect(claude.json).toHaveBeenCalledTimes(MAX_SUGERENCIAS_IA_POR_MINUTO + 1);
    expect(claude.json.mock.calls.at(-1)?.[0]).toMatchObject({ companyId: 8 });
  });

  it('lo que no pregunta a la IA no gasta el freno: facturas con regla del proveedor o con la IA fuera', async () => {
    const conRegla = armar({ regla: { cuentaCodigo: '601.01', centroCosto: null } });
    for (let i = 0; i < MAX_SUGERENCIAS_IA_POR_MINUTO + 5; i += 1) await proponer(conRegla.svc);
    expect(conRegla.claude.json).not.toHaveBeenCalled();

    const sinIa = armar({ disponible: false });
    for (let i = 0; i < MAX_SUGERENCIAS_IA_POR_MINUTO + 5; i += 1) await proponer(sinIa.svc);
    expect(sinIa.claude.json).not.toHaveBeenCalled();
    // Vuelve la IA: el freno sigue intacto y se puede preguntar hasta el tope completo.
    sinIa.claude.disponible.mockReturnValue(true);
    for (let i = 0; i < MAX_SUGERENCIAS_IA_POR_MINUTO + 5; i += 1) await proponer(sinIa.svc);
    expect(sinIa.claude.json).toHaveBeenCalledTimes(MAX_SUGERENCIAS_IA_POR_MINUTO);
  });

  it('una consulta que falla también cuenta (un 5xx pudo cobrarse): el tope no se esquiva con errores', async () => {
    const { svc, claude } = armar();
    claude.json.mockRejectedValue(new Error('boom'));
    for (let i = 0; i < MAX_SUGERENCIAS_IA_POR_MINUTO + 10; i += 1) await proponer(svc);
    expect(claude.json).toHaveBeenCalledTimes(MAX_SUGERENCIAS_IA_POR_MINUTO);
  });

  it('avisa UNA vez por ventana al pasar el tope, no una por factura', async () => {
    const { svc } = armar();
    for (let i = 0; i < MAX_SUGERENCIAS_IA_POR_MINUTO + 30; i += 1) await proponer(svc);
    const delTope = avisos.mock.calls.filter(([m]) => String(m).includes('por minuto'));
    expect(delTope).toHaveLength(1);
    expect(String(delTope[0][0])).toContain('Empresa 7');

    ahora += 61_000;
    for (let i = 0; i < MAX_SUGERENCIAS_IA_POR_MINUTO + 30; i += 1) await proponer(svc);
    expect(avisos.mock.calls.filter(([m]) => String(m).includes('por minuto'))).toHaveLength(2);
  });
});
