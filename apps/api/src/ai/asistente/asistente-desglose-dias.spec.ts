import { expandirPropuestasMultiDia } from './asistente-desglose-dias.js';
import type { PropuestaActividad } from './asistente-actividades.js';

function base(parcial: Partial<PropuestaActividad> = {}): PropuestaActividad {
  return {
    tipo: 'obra',
    tipoEtiqueta: 'Obra',
    razonTipo: 'x',
    resumen: 'Instalar cámaras',
    titulo: 'Instalar cámaras en IPADE',
    textoResponsable: null,
    responsable: { id: 1, nombre: 'Luis' },
    responsableOrigen: 'dicho',
    notaResponsable: null,
    responsableCandidatos: [],
    clienteNuevo: null,
    proyectoNuevo: null,
    notaCliente: null,
    textoCliente: 'IPADE',
    cliente: { id: 2, nombre: 'IPADE' },
    clienteCandidatos: [],
    sucursal: null,
    proyecto: null,
    proyectoCandidatos: [],
    fechaInicio: null,
    agenda: { dia: '2026-11-16', hora: '10:00', hasta: '2026-11-20', horaDicha: true, compromiso: null },
    duracionMin: 420,
    duracionOrigen: 'estimada',
    duracionDetalle: null,
    prioridad: 'Media',
    encargo: 'ejecucion',
    indicaciones: null,
    faltantes: [],
    avisos: [],
    correcciones: [],
    complejidad: null,
    ayudantes: [],
    herramientas: [],
    cupo: null,
    camposEvidencia: Array.from({ length: 50 }, (_, i) => ({
      nombre: `Cámara ${i + 1}`,
      momentos: ['ANTES', 'DESPUES'],
      notas: '',
    })),
    payload: { titulo: 'Instalar cámaras en IPADE', tiempoEstimadoMin: 420 },
    ...parcial,
  } as PropuestaActividad;
}

describe('expandirPropuestasMultiDia (API)', () => {
  it('sin hasta deja una sola', () => {
    expect(
      expandirPropuestasMultiDia([
        base({ agenda: { dia: '2026-11-16', hora: '10:00', hasta: null, horaDicha: true, compromiso: null } }),
      ]),
    ).toHaveLength(1);
  });

  it('5 días laborables con 50 cámaras → 5 actividades de 10', () => {
    const out = expandirPropuestasMultiDia([base()]);
    expect(out).toHaveLength(5);
    expect(out.map((p) => p.agenda?.dia)).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
    ]);
    expect(out.every((p) => !p.agenda?.hasta)).toBe(true);
    expect(out.map((p) => (p.camposEvidencia ?? []).length)).toEqual([10, 10, 10, 10, 10]);
    expect(out[0]!.titulo).toMatch(/día 1 de 5/);
    expect(out[0]!.payload.serieDia).toBe(1);
    expect(out[0]!.payload.serieTotal).toBe(5);
    expect(out[0]!.payload.periodoInicio).toBeUndefined();
    expect((out[0]!.camposEvidencia ?? [])[0]!.nombre).toBe('Cámara 1');
    expect((out[4]!.camposEvidencia ?? [])[0]!.nombre).toBe('Cámara 41');
  });

  it('salta fin de semana en el rango', () => {
    const out = expandirPropuestasMultiDia([
      base({ agenda: { dia: '2026-11-20', hora: '10:00', hasta: '2026-11-26', horaDicha: true, compromiso: null } }),
    ]);
    expect(out.map((p) => p.agenda?.dia)).toEqual([
      '2026-11-20',
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
    ]);
  });
});
