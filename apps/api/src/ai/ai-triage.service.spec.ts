import { ServiceUnavailableException } from '@nestjs/common';
import { AiTriageService } from './ai-triage.service.js';
import { limpiarTriage, peticionTriage } from './triage-ia.js';

function armar(opciones: { bandera?: boolean; disponible?: boolean; json?: jest.Mock } = {}) {
  const prisma = {
    featureFlag: {
      findFirst: jest.fn().mockResolvedValue(opciones.bandera ? { key: 'product.ai.triage', enabled: true } : null),
    },
    activity: { count: jest.fn().mockResolvedValue(0) },
  } as any;
  const claude = {
    disponible: jest.fn().mockReturnValue(opciones.disponible ?? false),
    json: opciones.json ?? jest.fn(),
  } as any;
  return { svc: new AiTriageService(prisma, claude), claude };
}

describe('AiTriageService (rules engine)', () => {
  const { svc } = armar();

  it('classifies emergencies as P0', async () => {
    const result = await svc.triageActivityText(
      { title: 'URGENTE: CCTV caído en sucursal', description: 'Sin servicio total' },
      1,
    );
    expect(result.priority).toBe('P0');
    expect(result.ticketType).toBe('EMERGENCIA');
    expect(result.risk).toBe('high');
    expect(result.provider).toBe('rules');
  });

  it('classifies preventive work', async () => {
    const result = await svc.triageActivityText(
      { title: 'Mantenimiento preventivo programado NVR' },
      1,
    );
    expect(result.ticketType).toBe('PREVENTIVO');
    expect(result.priority).toBe('P3');
  });

  it('requires companyId', async () => {
    await expect(svc.triageActivityText({ title: 'x' }, null)).rejects.toThrow();
  });
});

describe('AiTriageService con Claude', () => {
  it('con la bandera apagada no llama a la IA', async () => {
    const { svc, claude } = armar({ bandera: false, disponible: true });
    const r = await svc.triageActivityText({ title: 'Falla en NVR' }, 1);
    expect(claude.json).not.toHaveBeenCalled();
    expect(r.provider).toBe('rules');
  });

  it('con la bandera encendida usa la clasificación de Claude (Haiku, salida estructurada)', async () => {
    const json = jest.fn().mockResolvedValue({
      datos: { priority: 'P1', ticketType: 'CORRECTIVO', summary: 'El NVR de la caja no graba en Angelópolis.' },
      uso: {},
    });
    const { svc } = armar({ bandera: true, disponible: true, json });
    const r = await svc.triageActivityText({ title: 'NVR no graba', description: 'Caja', clientName: 'Bodegas Luna' }, 3);
    expect(r).toMatchObject({ provider: 'anthropic', priority: 'P1', ticketType: 'CORRECTIVO', summary: 'El NVR de la caja no graba en Angelópolis.' });
    const peticion = json.mock.calls[0][0];
    expect(peticion).toMatchObject({ proceso: 'triage', companyId: 3, modelo: 'claude-haiku-5-5', esfuerzo: 'low', pensar: false });
    expect(peticion.esquema).toMatchObject({ required: ['priority', 'ticketType', 'summary'] });
    expect(peticion.usuario).toContain('Cliente: Bodegas Luna');
  });

  it('si la IA falla se queda con las reglas', async () => {
    const json = jest.fn().mockRejectedValue(new ServiceUnavailableException('La IA no respondió.'));
    const { svc } = armar({ bandera: true, disponible: true, json });
    const r = await svc.triageActivityText({ title: 'URGENTE: CCTV caído' }, 1);
    expect(r).toMatchObject({ provider: 'rules', priority: 'P0', ticketType: 'EMERGENCIA' });
    expect(r.rationale).toContain('IA no disponible; se usaron reglas');
  });

  it('descarta valores fuera de las categorías y recorta el resumen', () => {
    expect(limpiarTriage({ priority: 'P9' as any, ticketType: 'CORRECTIVO', summary: 'x'.repeat(300) })).toEqual({
      ticketType: 'CORRECTIVO',
      summary: 'x'.repeat(180),
    });
    expect(peticionTriage({ title: 'a' }).usuario).toBe('Título: a\nDescripción: (sin descripción)');
  });
});
