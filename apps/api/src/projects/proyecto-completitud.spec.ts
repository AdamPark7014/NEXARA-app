import {
  evaluarCompletitud,
  mensajeFaltantes,
  nombreEsSoloCliente,
  sugerirNombreDescriptivo,
} from './proyecto-completitud.js';

const BASE_FICHA = {
  title: 'Instalación de cámaras Anfora',
  clientName: 'Anfora',
  clientId: 10,
  clientEsRelleno: false,
  projectType: 'INSTALACION',
  description: null as string | null,
  responsableId: 5,
  startDate: '2026-09-01T00:00:00.000Z',
  endDate: '2026-09-30T00:00:00.000Z',
};

describe('nombre descriptivo', () => {
  it('falla si el título es solo el cliente', () => {
    expect(nombreEsSoloCliente('ANFORA', 'Anfora')).toBe(true);
    expect(nombreEsSoloCliente('Anfora SA de CV', 'Anfora')).toBe(true);
    expect(nombreEsSoloCliente('Instalación de cámaras Anfora', 'Anfora')).toBe(false);
  });

  it('falla con menos de 3 palabras o 12 caracteres', () => {
    expect(nombreEsSoloCliente('Obra X', 'Cliente')).toBe(true);
    expect(nombreEsSoloCliente('abc', 'Cliente')).toBe(true);
  });
});

describe('evaluarCompletitud — FICHA', () => {
  it('marca nombre_descriptivo cuando el título es el cliente', () => {
    const r = evaluarCompletitud({ ...BASE_FICHA, title: 'Anfora' });
    expect(r.fichaOk).toBe(false);
    expect(r.nivel).toBe('FICHA');
    expect(r.faltantes.some((f) => f.clave === 'nombre_descriptivo')).toBe(true);
  });

  it('cliente relleno o sin id falla', () => {
    expect(
      evaluarCompletitud({ ...BASE_FICHA, clientId: null }).faltantes.some((f) => f.clave === 'cliente_valido'),
    ).toBe(true);
    expect(
      evaluarCompletitud({ ...BASE_FICHA, clientEsRelleno: true }).faltantes.some(
        (f) => f.clave === 'cliente_valido',
      ),
    ).toBe(true);
  });

  it('OTRO sin descripción falla tipo; con tipo real pasa', () => {
    expect(
      evaluarCompletitud({ ...BASE_FICHA, projectType: 'OTRO', description: null }).faltantes.some(
        (f) => f.clave === 'tipo',
      ),
    ).toBe(true);
    expect(
      evaluarCompletitud({ ...BASE_FICHA, projectType: 'OTRO', description: 'Obra especial' }).faltantes.some(
        (f) => f.clave === 'tipo',
      ),
    ).toBe(false);
    expect(evaluarCompletitud(BASE_FICHA).faltantes.some((f) => f.clave === 'tipo')).toBe(false);
  });

  it('exige responsable y fechas coherentes', () => {
    expect(
      evaluarCompletitud({ ...BASE_FICHA, responsableId: null }).faltantes.some((f) => f.clave === 'responsable'),
    ).toBe(true);
    expect(
      evaluarCompletitud({ ...BASE_FICHA, startDate: null }).faltantes.some((f) => f.clave === 'fecha_inicio'),
    ).toBe(true);
    expect(
      evaluarCompletitud({
        ...BASE_FICHA,
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-09-01T00:00:00.000Z',
      }).faltantes.some((f) => f.clave === 'fecha_fin'),
    ).toBe(true);
  });

  it('ficha completa deja fichaOk', () => {
    const r = evaluarCompletitud(BASE_FICHA);
    expect(r.fichaOk).toBe(true);
    expect(r.planOk).toBe(false);
    expect(r.nivel).toBe('PLAN');
  });
});

describe('evaluarCompletitud — PLAN y LISTO', () => {
  const conPlan = {
    ...BASE_FICHA,
    objective: 'Cubrir accesos y almacén',
    scopeItems: [{ kind: 'ENTREGABLE' }],
    milestones: [
      { plannedDate: '2026-09-10T00:00:00.000Z', status: 'PENDIENTE' },
      { plannedDate: '2026-09-25T00:00:00.000Z', status: 'PENDIENTE' },
    ],
    activities: [{ estatus: 'En Proceso' }],
  };

  it('sin alcance/hitos/actividad no pasa PLAN', () => {
    const r = evaluarCompletitud(BASE_FICHA);
    expect(r.faltantes.some((f) => f.clave === 'alcance')).toBe(true);
    expect(r.faltantes.some((f) => f.clave === 'cronograma')).toBe(true);
    expect(r.faltantes.some((f) => f.clave === 'actividad')).toBe(true);
  });

  it('con objetivo, entregable, 2 hitos en rango y actividad → planOk', () => {
    const r = evaluarCompletitud(conPlan);
    expect(r.fichaOk).toBe(true);
    expect(r.planOk).toBe(true);
    expect(r.listoOk).toBe(false);
    expect(r.nivel).toBe('LISTO');
  });

  it('LISTO con trabajo cerrado y acta', () => {
    const r = evaluarCompletitud({
      ...conPlan,
      activities: [{ estatus: 'Finalizada' }],
      milestones: [
        { plannedDate: '2026-09-10T00:00:00.000Z', status: 'CUMPLIDO' },
        { plannedDate: '2026-09-25T00:00:00.000Z', status: 'CANCELADO' },
      ],
      documents: [{ name: 'Acta de entrega' }],
    });
    expect(r.completo).toBe(true);
    expect(r.listoOk).toBe(true);
    expect(r.faltantes).toEqual([]);
  });
});

describe('helpers de texto', () => {
  it('sugerirNombreDescriptivo arma tipo + cliente', () => {
    expect(sugerirNombreDescriptivo('Instalación', 'Anfora')).toBe('Instalación de cámaras Anfora');
    expect(sugerirNombreDescriptivo('Mantenimiento', 'IPADE')).toBe('Mantenimiento de equipos IPADE');
  });

  it('mensajeFaltantes junta etiquetas', () => {
    expect(
      mensajeFaltantes([
        { clave: 'a', etiqueta: 'Fecha de fin', ayuda: '' },
        { clave: 'b', etiqueta: 'Responsable', ayuda: '' },
        { clave: 'c', etiqueta: 'Cronograma', ayuda: '' },
      ]),
    ).toBe('falta fecha de fin, responsable y cronograma');
  });
});
