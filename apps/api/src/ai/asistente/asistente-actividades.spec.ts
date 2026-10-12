import {
  aFechaISO,
  buscar,
  construirPropuesta,
  mensajeUsuario,
  puntaje,
  type AccionPlan,
  type CatalogosNexara,
} from './asistente-actividades.js';

const catalogos: CatalogosNexara = {
  personas: [
    { id: 7, nombre: 'José Antonio Ramírez', puesto: 'Encargado de soporte' },
    { id: 8, nombre: 'Carolina Pérez' },
    { id: 9, nombre: 'Juan González' },
    { id: 10, nombre: 'Juan Sánchez' },
  ],
  clientes: [
    { id: 1, name: 'TOX Logística' },
    { id: 2, name: 'Banorte' },
  ],
  sucursales: [
    { id: 50, clientId: 2, name: 'Plaza Satélite', branchNumber: '014', city: 'Naucalpan', clientName: 'Banorte' },
  ],
  proyectos: [{ id: 300, title: 'CCTV nave 2', clientId: 1, clientName: 'TOX Logística' }],
};

const base: AccionPlan = {
  tipo: 'tarea',
  razonTipo: 'Junta con el cliente',
  subtipoTarea: 'Junta',
  tipoServicio: null,
  titulo: 'Ir a Tox con el cliente',
  indicaciones: null,
  responsable: 'Antonio',
  cliente: 'Tox',
  sitio: null,
  fecha: '2026-10-12',
  hora: '15:00',
  duracionMin: null,
  prioridad: 'Media',
  encargo: null,
};

// 12-10-2026 10:00 en CDMX
const ahora = new Date('2026-10-12T16:00:00Z');
const ctx = { creadoPorId: 1, ahora };

describe('asistente de actividades', () => {
  it('«que Antonio vaya a Tox a las 3 con el cliente» queda lista para crear', () => {
    const p = construirPropuesta(base, catalogos, ctx);
    expect(p.responsable).toEqual({ id: 7, nombre: 'José Antonio Ramírez' });
    expect(p.cliente).toEqual({ id: 1, nombre: 'TOX Logística' });
    expect(p.faltantes).toEqual([]);
    expect(p.payload).toMatchObject({
      responsableId: 7,
      creadoPorId: 1,
      coreKind: 'tarea',
      activityType: 'INTERNAL',
      ticketType: 'OTRO',
      ticketTypeCustom: 'Junta',
      clientId: 1,
      fechaInicio: '2026-10-12T21:00:00.000Z',
      estatus: 'Pendiente',
    });
    expect(p.resumen).toBe('Tarea · Junta para José Antonio Ramírez en TOX Logística hoy 15:00');
  });

  it('con dos personas igual de probables no elige: deja candidatos', () => {
    const p = construirPropuesta({ ...base, responsable: 'Juan' }, catalogos, ctx);
    expect(p.responsable).toBeNull();
    expect(p.faltantes).toContain('responsable');
    expect(p.responsableCandidatos.map((c) => c.id).sort()).toEqual([10, 9].sort());
    expect(p.payload.responsableId).toBeUndefined();
  });

  it('un servicio sin cliente registrado pide el cliente', () => {
    const p = construirPropuesta(
      { ...base, tipo: 'servicio', tipoServicio: 'CORRECTIVO', cliente: 'Farmacias Patito' },
      catalogos,
      ctx,
    );
    expect(p.faltantes).toEqual(['cliente']);
    expect(p.payload).toMatchObject({ coreKind: 'servicio', ticketType: 'CORRECTIVO', branchName: 'Farmacias Patito' });
  });

  it('una sucursal conocida trae su cliente y sus datos', () => {
    const p = construirPropuesta(
      { ...base, tipo: 'servicio', tipoServicio: 'PREVENTIVO', cliente: null, sitio: 'plaza satelite' },
      catalogos,
      ctx,
    );
    expect(p.cliente).toEqual({ id: 2, nombre: 'Banorte' });
    expect(p.sucursal).toEqual({ id: 50, nombre: 'Plaza Satélite' });
    expect(p.payload).toMatchObject({ clientId: 2, branchNumber: '014', branchCity: 'Naucalpan' });
  });

  it('una obra toma el único proyecto activo del cliente', () => {
    const p = construirPropuesta({ ...base, tipo: 'obra', subtipoTarea: null }, catalogos, ctx);
    expect(p.proyecto).toEqual({ id: 300, nombre: 'CCTV nave 2' });
    expect(p.payload).toMatchObject({ projectId: 300, activityType: 'CLIENT', ticketType: 'INSTALACION' });
    expect(p.payload.ticketTypeCustom).toBeUndefined();
  });

  it('comercial y duración con tope de 12 horas', () => {
    const p = construirPropuesta({ ...base, tipo: 'comercial', duracionMin: 2000 }, catalogos, ctx);
    expect(p.payload).toMatchObject({ ticketType: 'OTRO', ticketTypeCustom: 'COMERCIAL', tiempoEstimadoMin: 720 });
  });

  it('avisa si la hora ya pasó', () => {
    const p = construirPropuesta({ ...base, hora: '08:00' }, catalogos, ctx);
    expect(p.avisos.join(' ')).toMatch(/pasado/);
  });

  it('coincidencias sin acentos ni mayúsculas', () => {
    expect(puntaje('jose antonio', 'José Antonio Ramírez')).toBe(2);
    expect(puntaje('Carolina Pérez', 'carolina perez')).toBe(3);
    expect(puntaje('xyz', 'Banorte')).toBe(0);
    expect(buscar('banor', catalogos.clientes, (c) => c.name).elegido?.id).toBe(2);
    // Coincidencia débil (solo el inicio de una palabra): propone, no elige.
    const debil = buscar('Caro Ruiz', catalogos.personas, (p) => p.nombre);
    expect(debil.elegido).toBeNull();
    expect(debil.candidatos[0].id).toBe(8);
  });

  it('fechas en hora de CDMX', () => {
    expect(aFechaISO('2026-10-13', '9:30')).toBe('2026-10-13T15:30:00.000Z');
    expect(aFechaISO('2026-10-13', null)).toBe('2026-10-13T15:00:00.000Z');
    expect(aFechaISO(null, '15:00')).toBeNull();
    expect(mensajeUsuario('  hola ', ahora, 'Christian')).toContain('(2026-10-12), 10:00 hora de Ciudad de México.');
  });
});
