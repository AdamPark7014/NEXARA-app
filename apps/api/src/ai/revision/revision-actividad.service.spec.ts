import { Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AVISO_SIN_IA, RevisionActividadService } from './revision-actividad.service.js';
import { IaNoDisponibleException } from '../claude/compuerta-ia.js';

const ACTIVIDAD = {
  titulo: 'Instalar 4 cámaras en Hotel Aurora',
  coreKind: 'tarea',
  ticketType: null,
  ticketTypeCustom: 'Instalación',
  indicaciones: null,
  estatus: 'Finalizada',
  fechaInicio: new Date('2026-11-09T15:00:00Z'),
  fechaMaxima: new Date('2026-11-10T00:00:00Z'),
  fechaEntregaEsperada: null,
  periodoInicio: null,
  periodoFin: null,
  fechaFinalizacion: new Date('2026-11-09T22:00:00Z'),
  tiempoEstimadoMin: 240,
  activityEvidences: [],
  evidenceFields: [],
  incidents: [],
  evidenceReviews: [],
};

function armar(opts: { disponible?: boolean; actividad?: unknown } = {}) {
  const prisma = { activity: { findFirst: jest.fn().mockResolvedValue(opts.actividad === undefined ? ACTIVIDAD : opts.actividad) } };
  const claude = {
    disponible: jest.fn().mockReturnValue(opts.disponible ?? true),
    json: jest.fn().mockResolvedValue({ datos: { veredicto: 'correcta', calificacionSugerida: 5, porque: ['Se entregó a tiempo.'], incidencias: [], recomendacion: null } }),
  };
  const svc = new RevisionActividadService(prisma as never, claude as never);
  return { svc, claude };
}

describe('RevisionActividadService.revisar', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('sin IA (disponible() falso) el aviso es el texto fijo, sin «configurada» ni nombres técnicos, y se muestran los hechos', async () => {
    const { svc, claude } = armar({ disponible: false });
    const r = await svc.revisar(7, 1);
    expect(r.ia).toBeNull();
    expect(r.avisoIa).toBe('La IA no está disponible por ahora: se muestran solo los hechos.');
    expect(r.avisoIa).toBe(AVISO_SIN_IA);
    expect(r.hechos.length).toBeGreaterThan(0);
    expect(claude.json).not.toHaveBeenCalled();
  });

  it('si la IA falla, el aviso es el mismo texto fijo y NO contiene nada del mensaje de la excepción (va al log)', async () => {
    for (const error of [
      new IaNoDisponibleException('La IA no está disponible por ahora: ya se avisó al administrador.', 'llave_puerta_invalida', true),
      new ServiceUnavailableException('Se acabó el presupuesto de IA de este mes: avísale al administrador.'),
      new Error('connect ECONNREFUSED 10.0.0.9:8080 token=abc123'),
    ]) {
      warn.mockClear();
      const { svc } = armar();
      (svc as unknown as { claude: { json: jest.Mock } }).claude.json.mockRejectedValue(error);
      const r = await svc.revisar(7, 1);
      expect(r.ia).toBeNull();
      expect(r.avisoIa).toBe(AVISO_SIN_IA);
      expect(r.avisoIa).not.toContain(error.message);
      expect(r.avisoIa).not.toMatch(/ECONNREFUSED|token|presupuesto|\(/);
      expect(r.hechos.length).toBeGreaterThan(0);
      // El detalle sí queda en el log.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain(error.message);
    }
  });

  it('con IA responde con su opinión y sin aviso', async () => {
    const { svc, claude } = armar();
    const r = await svc.revisar(7, 1);
    expect(claude.json).toHaveBeenCalledWith(expect.objectContaining({ proceso: 'revision-actividad', companyId: 1 }));
    expect(r.avisoIa).toBeNull();
    expect(r.ia).toMatchObject({ veredicto: 'correcta', calificacionSugerida: 5 });
  });

  it('una actividad que no existe sigue siendo 404', async () => {
    const { svc } = armar({ actividad: null });
    await expect(svc.revisar(7, 1)).rejects.toBeInstanceOf(NotFoundException);
  });
});
