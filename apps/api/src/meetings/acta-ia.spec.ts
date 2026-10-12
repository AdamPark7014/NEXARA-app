import { construirActa, mensajeActa, minutaTexto, type ActaPlan } from './acta-ia.js';

const personas = [
  { id: 7, nombre: 'José Antonio Ramírez' },
  { id: 8, nombre: 'Carolina Pérez' },
];

const plan: ActaPlan = {
  resumen: 'Se revisó el avance de Tox y la falla de Banorte.',
  temas: [{ titulo: 'Tox', detalle: 'Falta cablear la nave 2.' }],
  decisiones: ['Comprar 20 cámaras domo.'],
  acuerdos: [
    { tipo: 'ACUERDO', descripcion: 'Enviar la cotización a Tox', responsable: 'Antonio', fechaCompromiso: '2026-10-16' },
    { tipo: 'RIESGO', descripcion: 'Retraso del proveedor', responsable: null, fechaCompromiso: 'el viernes' },
    { tipo: 'ACUERDO', descripcion: '   ', responsable: null, fechaCompromiso: null },
  ],
  pendientesSinDueno: ['Revisar el contrato de Banorte'],
};

describe('acta de reunión con IA', () => {
  it('liga responsables, descarta acuerdos vacíos y fechas que no son fecha', () => {
    const acta = construirActa(plan, personas);
    expect(acta.acuerdos).toHaveLength(2);
    expect(acta.acuerdos[0]).toMatchObject({ responsable: { id: 7, nombre: 'José Antonio Ramírez' }, fechaCompromiso: '2026-10-16' });
    expect(acta.acuerdos[1]).toMatchObject({ tipo: 'RIESGO', responsable: null, fechaCompromiso: null });
  });

  it('la minuta trae resumen, temas, decisiones y pendientes', () => {
    const texto = minutaTexto(plan);
    expect(texto).toContain('RESUMEN\nSe revisó');
    expect(texto).toContain('1. Tox\n   Falta cablear');
    expect(texto).toContain('DECISIONES\n- Comprar 20 cámaras domo.');
    expect(texto).toContain('PENDIENTES SIN RESPONSABLE\n- Revisar el contrato');
  });

  it('la fecha de la reunión es el día guardado, sin correrse por la zona horaria', () => {
    const m = mensajeActa({ titulo: 'Junta del viernes', fecha: new Date('2026-10-09T00:00:00Z'), asistentes: ['Ana'] }, 'hola');
    expect(m).toContain('Fecha de la reunión: 2026-10-09');
    expect(m).toContain('Asistentes: Ana');
  });

  it('tolera una respuesta incompleta', () => {
    const acta = construirActa({ resumen: 'x' } as ActaPlan, personas);
    expect(acta.acuerdos).toEqual([]);
    expect(acta.minuta).toBe('RESUMEN\nx');
  });
});
