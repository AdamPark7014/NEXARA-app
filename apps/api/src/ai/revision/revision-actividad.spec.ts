import { hechosDe, peticionRevision, salidaSegura, type DatosRevision } from './revision-actividad.js';

const base: DatosRevision = {
  titulo: 'Instalar 4 cámaras en Hotel Aurora',
  tipo: 'proyecto',
  subtipo: null,
  indicaciones: null,
  estatus: 'Finalizada',
  limite: new Date('2026-11-10T00:00:00Z'),
  entregadaAt: new Date('2026-11-09T22:00:00Z'),
  tiempoEstimadoMin: 240,
  minutosReales: null,
  campos: [
    { nombre: 'Cámara 1', pedidos: 3, subidos: 3 },
    { nombre: 'Cámara 2', pedidos: 3, subidos: 3 },
  ],
  fotosLibres: 0,
  incidencias: [],
  revision: { decision: 'APROBADA', calificacion: 5, nota: 'Bien', revisor: 'Revisora Uno' },
};

const ahora = new Date('2026-11-15T12:00:00Z');

describe('hechosDe', () => {
  it('a tiempo y completa: todo en verde y la calificación se dice tal cual', () => {
    const h = hechosDe(base, ahora);
    expect(h.map((x) => x.texto)).toEqual([
      'Se entregó a tiempo.',
      'Fotos completas: 6 de 6 en 2 elementos.',
      'Calificación: aprobada, 5 de 5 (Revisora Uno). Nota: «Bien».',
    ]);
    expect(h.filter((x) => x.tono === 'mal')).toHaveLength(0);
  });

  it('tarde, fotos faltantes e incidencia sin resolver salen como problemas', () => {
    const h = hechosDe(
      {
        ...base,
        entregadaAt: new Date('2026-11-10T02:30:00Z'),
        campos: [{ nombre: 'Cámara 1', pedidos: 3, subidos: 1 }],
        incidencias: [{ tipo: 'FALTA_MATERIAL', severidad: 'ALTA', descripcion: 'No llegó el cable', resuelta: false }],
      },
      ahora,
    );
    const malos = h.filter((x) => x.tono === 'mal').map((x) => x.texto);
    expect(malos).toEqual([
      'Se entregó 2 h 30 min después del límite.',
      'Faltan fotos: 1 de 3 (Cámara 1).',
      'Incidencia alta: Falta de material («No llegó el cable»), sin resolver.',
    ]);
  });

  it('sin entregar y vencida; sin calificación', () => {
    const h = hechosDe({ ...base, entregadaAt: null, revision: null, campos: [], fotosLibres: 0 }, ahora);
    expect(h[0]!.texto).toMatch(/^No se ha entregado y el límite venció hace/);
    expect(h.at(-1)!.texto).toBe('Todavía no tiene calificación.');
  });
});

describe('peticionRevision y salidaSegura', () => {
  it('a la IA solo le llegan los hechos medidos, con Haiku', () => {
    const p = peticionRevision(base, hechosDe(base, ahora));
    expect(p.modelo).toBe('claude-haiku-5-5');
    expect(p.usuario).toContain('- Se entregó a tiempo.');
    expect(p.usuario).not.toContain('undefined');
  });

  it('recorta y sanea lo que regresa la IA', () => {
    expect(salidaSegura({ veredicto: 'otra', calificacionSugerida: 9, porque: ['a', '', 'b', 'c', 'd'], incidencias: 'x', recomendacion: '  ' })).toEqual({
      veredicto: 'revisar',
      calificacionSugerida: null,
      porque: ['a', 'b', 'c'],
      incidencias: [],
      recomendacion: null,
    });
  });
});
