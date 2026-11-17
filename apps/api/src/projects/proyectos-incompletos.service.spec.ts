import {
  destinatariosAviso,
  diasHabilesSeguidos,
  proyectoRequiereAviso,
  textoAvisoProyectos,
} from './proyectos-incompletos.service.js';

describe('proyectos incompletos — reglas puras', () => {
  const base = {
    id: 1,
    title: 'Anfora',
    status: 'ACTIVE',
    vendorId: 9,
    createdById: 3,
    responsableId: 5,
    client: { id: 1, name: 'Anfora', deletedAt: null },
    projectType: 'OTRO',
    description: null,
    startDate: null,
    endDate: null,
    scopeItems: [],
    milestones: [],
    activities: [],
    documents: [],
  };

  it('requiere aviso si falta FICHA', () => {
    expect(proyectoRequiereAviso(base as any)).toBe(true);
  });

  it('no avisa COMPLETED/CANCELLED', () => {
    expect(proyectoRequiereAviso({ ...base, status: 'COMPLETED' } as any)).toBe(false);
    expect(proyectoRequiereAviso({ ...base, status: 'CANCELLED' } as any)).toBe(false);
  });

  it('destinatarios: creador + responsable distinto', () => {
    expect(destinatariosAviso(base as any).sort()).toEqual([3, 5]);
    expect(destinatariosAviso({ ...base, createdById: null } as any)).toContain(9);
  });

  it('texto de un proyecto', () => {
    const t = textoAvisoProyectos([
      { id: 7, title: 'Renovacion CCTV Ipade', faltantesEtiquetas: ['Fecha de fin', 'Responsable', 'Cronograma'] },
    ]);
    expect(t.message).toContain('Renovacion CCTV Ipade');
    expect(t.message).toContain('fecha de fin');
    expect(t.relatedUrl).toBe('/erp/proyectos/7?completar=1');
  });

  it('días hábiles cuentan L–S', () => {
    // vie→lun: vie,sab,lun = 3 (domingo no)
    expect(
      diasHabilesSeguidos(new Date('2026-11-13T12:00:00.000Z'), new Date('2026-11-16T12:00:00.000Z')),
    ).toBe(3);
  });
});
