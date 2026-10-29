import { parsearLiga, rutaDeLiga, tipoDeFolio, TIPOS_LIGA } from './ligas.js';
import { LigasService } from './ligas.service.js';

describe('ligas del chat: ruta ↔ tipo', () => {
  it('cada tipo se lee de vuelta de su propia ruta (una sola tabla para guardar y para pintar)', () => {
    expect(parsearLiga(rutaDeLiga.actividad(20))).toEqual({ tipo: 'actividad', id: 20 });
    expect(parsearLiga(rutaDeLiga.evidencia(20))).toEqual({ tipo: 'evidencia', id: 20 });
    expect(parsearLiga(rutaDeLiga.evidencia(20, 7))).toEqual({ tipo: 'evidencia', id: 20, evidenciaId: 7 });
    expect(parsearLiga(rutaDeLiga.cotizacion(12))).toEqual({ tipo: 'cotizacion', id: 12 });
    expect(parsearLiga(rutaDeLiga.cliente(5))).toEqual({ tipo: 'cliente', id: 5 });
    expect(parsearLiga(rutaDeLiga.proyecto(3))).toEqual({ tipo: 'proyecto', id: 3 });
    expect(parsearLiga(rutaDeLiga.asistencia(7, '2026-10-29'))).toEqual({
      tipo: 'asistencia',
      id: 7,
      fecha: '2026-10-29',
    });
    expect(parsearLiga(rutaDeLiga.viatico(44))).toEqual({ tipo: 'viatico', id: 44 });
    expect(parsearLiga(rutaDeLiga.factura(9))).toEqual({ tipo: 'factura', id: 9 });
    expect(TIPOS_LIGA).toHaveLength(8);
  });

  it('lo que no es una liga interna conocida no se resuelve', () => {
    expect(parsearLiga('https://evil.example/erp/cotizaciones/1')).toBeNull();
    expect(parsearLiga('/erp/cotizaciones/abc')).toBeNull();
    expect(parsearLiga('/erp/asistencias/indicadores/7')).toBeNull(); // sin día
    expect(parsearLiga('/erp/finance/viatics')).toBeNull(); // sin id
    expect(parsearLiga('user:3')).toBeNull();
  });

  it('folios sueltos: actividad y cotización (con cadena y revisión)', () => {
    expect(tipoDeFolio('AN-0031')).toBe('actividad');
    expect(tipoDeFolio('nex-lj75100126-0007-ja.ce-r2')).toBe('cotizacion');
    expect(tipoDeFolio('NXR-2026-763366')).toBe('cotizacion');
    expect(tipoDeFolio('hola')).toBeNull();
  });
});

describe('LigasService.resolver — permisos de quien ve, no de quien escribió', () => {
  const cotizacion = {
    id: 12,
    quoteNumber: 'NEX-LJ75100126-0007',
    status: 'SENT',
    total: 15000,
    currency: 'MXN',
    clientName: null,
    clientCompany: 'Grupo Tox',
    projectName: 'CCTV CEDIS',
    issueDate: new Date('2026-10-20T18:00:00Z'),
  };
  const actividad = {
    id: 20,
    anNumber: 'AN-0020',
    titulo: 'Instalar cámaras',
    estatus: 'En Proceso',
    prioridad: 'Alta',
    responsableId: 9,
    creadoPorId: 1,
    fechaMaxima: null,
    fechaEntregaEsperada: null,
    responsable: { nombre: 'Raúl Pérez' },
  };

  function servicio(alcance = { isOmniscient: false, reportIds: [] as number[] }) {
    const prisma = {
      cotizacion: { findMany: jest.fn().mockResolvedValue([cotizacion]) },
      activity: { findMany: jest.fn().mockResolvedValue([actividad]) },
      evidence: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const chat = { resolveChatScope: jest.fn().mockResolvedValue(alcance) } as any;
    return { svc: new LigasService(prisma, chat), prisma };
  }

  it('cotización: con permiso trae estado, cliente y monto', async () => {
    const { svc } = servicio();
    const r = await svc.resolver(
      { id: 1, roleKey: 'ceo', permissions: ['cotizaciones.access'] },
      1,
      ['/erp/cotizaciones/12'],
    );
    expect(r['/erp/cotizaciones/12']).toMatchObject({
      acceso: true,
      folio: 'NEX-LJ75100126-0007',
      titulo: 'CCTV CEDIS',
      estado: 'Enviada',
      monto: { total: 15000, moneda: 'MXN' },
    });
  });

  it('cotización: sin permiso solo el título genérico (ni cliente ni monto)', async () => {
    const { svc } = servicio();
    const r = await svc.resolver({ id: 2, roleKey: 'tecnico', permissions: [] }, 1, ['/erp/cotizaciones/12']);
    const t = r['/erp/cotizaciones/12']!;
    expect(t.acceso).toBe(false);
    expect(t.titulo).toBe('Cotización NEX-LJ75100126-0007');
    expect(t.monto).toBeNull();
    expect(t.detalle).toEqual([]);
    expect(JSON.stringify(t)).not.toContain('Grupo Tox');
  });

  it('actividad: fuera de su árbol no ve el título ni el responsable', async () => {
    const { svc } = servicio({ isOmniscient: false, reportIds: [] });
    const r = await svc.resolver({ id: 50, permissions: ['activities.view'] }, 1, ['/erp/actividades/20']);
    expect(r['/erp/actividades/20']).toMatchObject({ acceso: false, titulo: 'Actividad AN-0020' });
    expect(JSON.stringify(r)).not.toContain('Raúl');
  });

  it('actividad: el responsable y su jefe sí la ven completa', async () => {
    const { svc } = servicio({ isOmniscient: false, reportIds: [9] });
    const r = await svc.resolver({ id: 4, permissions: ['activities.view'] }, 1, ['folio:AN-0020']);
    expect(r['folio:AN-0020']).toMatchObject({ acceso: true, titulo: 'Instalar cámaras', estado: 'En Proceso' });
  });

  it('ignora refs que no son ligas y respeta el tope', async () => {
    const { svc, prisma } = servicio();
    const refs = ['nada', 'user:3', ...Array.from({ length: 80 }, (_, i) => `/erp/cotizaciones/${i + 1}`)];
    await svc.resolver({ id: 1, isSuperAdmin: true }, 1, refs);
    const ids = prisma.cotizacion.findMany.mock.calls[0][0].where.id.in;
    expect(ids.length).toBeLessThanOrEqual(40);
  });
});
