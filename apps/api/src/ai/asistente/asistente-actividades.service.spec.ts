import { AsistenteActividadesService } from './asistente-actividades.service';

/** El aviso de pantalla eran dos frases. La prueba lo cita y exige una. */
const TEXTO_VIEJO = 'No encontré ninguna actividad en el texto. ¿Qué hay que hacer y quién?';
const TEXTO_NUEVO = 'No encontré ninguna actividad en el texto: ¿qué hay que hacer y quién?';

describe('AsistenteActividadesService', () => {
  const uso = {
    modelo: 'claude-haiku-5-5',
    tokensEntrada: 12,
    tokensSalida: 4,
    tokensCacheLeidos: 0,
    tokensCacheEscritos: 0,
    tokensPensamiento: 0,
    usdAprox: 0,
  };

  function armar(salida: unknown) {
    const prisma = {
      serviceClient: { findMany: jest.fn().mockResolvedValue([]) },
      serviceClientBranch: { findMany: jest.fn().mockResolvedValue([]) },
      operationalProject: { findMany: jest.fn().mockResolvedValue([]) },
      activity: { findMany: jest.fn().mockResolvedValue([{ titulo: 'Inventario Toks', branchName: null }]) },
    };
    const users = {
      findOne: jest.fn().mockResolvedValue({ role: 'coordinador' }),
      findAssignableUsers: jest.fn().mockResolvedValue([]),
    };
    const claude = {
      json: jest.fn().mockResolvedValue({ datos: salida, uso }),
    };
    const complejidad = { medianas: jest.fn().mockRejectedValue(new Error('sin base')) };
    const servicio = new AsistenteActividadesService(prisma as never, users as never, claude as never, complejidad as never);
    return { servicio, claude, users };
  }

  it(`cita el texto viejo «${TEXTO_VIEJO}» y lo deja en una frase`, async () => {
    const { servicio, claude } = armar(null);
    const res = await servicio.interpretar('ok gracias', { id: 7, nombre: 'Ana' }, 1);

    expect(res.aclaracion).toBe(TEXTO_NUEVO);
    expect(res.aclaracion).not.toBe(TEXTO_VIEJO);
    expect(res.aclaracion).toContain('No encontré ninguna actividad en el texto');
    expect(res.aclaracion).toContain('hay que hacer y quién');
    expect(res.aclaracion!.split('. ')).toEqual([TEXTO_NUEVO]);
    expect(res.propuestas).toEqual([]);
    expect(claude.json).toHaveBeenCalledWith(expect.objectContaining({ proceso: 'asistente-actividades', companyId: 1 }));
  });

  it('propone tiempo aunque no haya medianas, y separa a dos personas en una sola acción', async () => {
    const { servicio, users } = armar({
      acciones: [{ tipo: 'tarea', sub: 'Entrega', titulo: 'Llevar DVR', detalle: null, quien: 'Ana y Luis', cliente: null, lugar: null, inicio: null, limite: null, min: null, prio: 'Media', encargo: null, comp: null, cant: null }],
      aclaracion: null,
    });
    users.findAssignableUsers.mockResolvedValue([
      { id: 1, nombre: 'Ana Ruiz', email: 'ana@x.mx', horaEntrada: null, horaSalida: null },
      { id: 2, nombre: 'Luis Soto', email: 'luis@x.mx', horaEntrada: '08:00', horaSalida: '17:00' },
    ]);
    const res = await servicio.interpretar('que Ana y Luis lleven el DVR', { id: 7, nombre: 'Ana' }, 1);
    expect(res.propuestas.map((p) => p.responsable?.id)).toEqual([1, 2]);
    expect(res.propuestas[0].duracionMin).toBeGreaterThan(0);
    expect(res.propuestas[0].duracionOrigen).toBe('estimada');
  });
});
