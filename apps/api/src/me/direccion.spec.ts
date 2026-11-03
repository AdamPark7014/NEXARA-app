import {
  armarEncargados,
  armarObra,
  esDeObra,
  familiaDeObra,
  filasDeArea,
  motivoLegible,
  puedeVerObra,
  raizDelOrganigrama,
  resumenDeGente,
  type GenteKpi,
  type PersonaOrg,
} from './direccion';

const kpi = (id: number, nombre: string, medidas: number, aTiempo: number, esperados: number, puntuales: number, sinChecar = 0, motivo?: string): GenteKpi => ({
  persona: { id, nombre },
  totales: { entregas: { medidas, aTiempo }, asistenciaPuntual: { esperados, puntuales }, diasSinChecada: sinChecar },
  motivos: motivo ? [motivo] : [],
});

describe('resumen de gente', () => {
  it('suma y saca porcentajes sin inventar cuando no hay datos', () => {
    expect(resumenDeGente([kpi(1, 'A', 10, 9, 10, 5, 2), kpi(2, 'B', 10, 7, 10, 5, 1)], 3)).toMatchObject({
      personas: 2, medidas: 20, aTiempo: 16, pctATiempo: 80, pctPuntual: 50, diasSinChecada: 3, porRevisar: 3,
    });
    expect(resumenDeGente([])).toMatchObject({ pctATiempo: null, pctPuntual: null });
  });

  it('los minutos largos se leen en horas', () => {
    expect(motivoLegible('16 retardos (2421 min tarde)')).toBe('16 retardos (40 h tarde)');
    expect(motivoLegible('2 retardos (65 min tarde)')).toBe('2 retardos (65 min tarde)');
    expect(motivoLegible(null)).toBeNull();
  });
});

describe('Mi área', () => {
  it('primero quien no ha checado ni entregado, luego lo que más falta', () => {
    const f = filasDeArea(
      [kpi(1, 'Bien', 19, 18, 25, 23), kpi(2, 'Tarde', 17, 15, 21, 3, 3, '16 retardos (2421 min tarde)'), kpi(3, 'Ausente', 0, 0, 4, 0, 4, '4 días sin trabajar')],
      new Map([[1, 2]]),
    );
    expect(f.map((x) => x.nombre)).toEqual(['Ausente', 'Tarde', 'Bien']);
    expect(f[1].queLePasa).toBe('16 retardos (40 h tarde)');
    expect(f[2].porRevisar).toBe(2);
    expect(f[0].pctATiempo).toBeNull();
  });
});

describe('por encargado', () => {
  const org: PersonaOrg[] = [
    { id: 1, nombre: 'Christian Del Pozo', managerId: null, roleKey: 'ceo' },
    { id: 2, nombre: 'Adam Del Pozo', managerId: null, roleKey: 'ceo' },
    { id: 8, nombre: 'David Morales Zenón', managerId: 1, puesto: 'Ingenieros' },
    { id: 7, nombre: 'Luis Joel Aguilar', managerId: 1 },
    { id: 38, nombre: 'Daniela Hernández', managerId: 1 },
    { id: 5, nombre: 'Mónica García', managerId: 1 },
    { id: 61, nombre: 'Antonio Hernández', managerId: 8 },
    { id: 57, nombre: 'Salvador Hernández', managerId: 8 },
  ];
  const gente = [kpi(8, 'David', 3, 3, 20, 18), kpi(7, 'Luis', 35, 32, 20, 15), kpi(38, 'Daniela', 59, 50, 20, 15), kpi(5, 'Mónica', 24, 21, 20, 10), kpi(61, 'Antonio', 0, 0, 4, 0, 4), kpi(57, 'Salvador', 19, 18, 25, 17)];

  it('la cabeza es quien más gente directa tiene', () => {
    expect(raizDelOrganigrama(org)).toBe(1);
    expect(raizDelOrganigrama([{ id: 1, nombre: 'Solo', managerId: null }])).toBeNull();
  });

  it('separa equipos, revisores por encargo y gente directa, y cuenta cada evidencia una vez', () => {
    const f = armarEncargados({
      org,
      gente,
      revisores: [{ userId: 38, revisorId: 7 }, { userId: 5, revisorId: 7 }],
      pendientesDe: new Map([[61, 2], [38, 9], [5, 3], [8, 1]]),
      raizId: 1,
      viewerId: 1,
    });
    const david = f.find((x) => x.tipo === 'equipo')!;
    expect(david).toMatchObject({ nombre: 'David Morales', aCargo: 2, porRevisar: 2, pctATiempo: 95 });
    expect(david.pesa).toBe('1 persona sin checar ni actividad');
    const luis = f.find((x) => x.tipo === 'revisor')!;
    expect(luis).toMatchObject({ id: 7, aCargo: 2, porRevisar: 12, pesa: 'Revisa a Daniela, Mónica' });
    const directos = f.find((x) => x.tipo === 'directos')!;
    expect(directos).toMatchObject({ nombre: 'Tu gente directa', aCargo: 2, porRevisar: 1, pesa: 'Sus evidencias le llegan a ti' });
    expect(f.reduce((s, x) => s + x.porRevisar, 0)).toBe(15);
  });

  it('a otro directivo le dice de quién es la gente', () => {
    const f = armarEncargados({ org, gente, revisores: [], pendientesDe: new Map(), raizId: 1, viewerId: 2 });
    expect(f.find((x) => x.tipo === 'directos')?.nombre).toBe('Gente directa de Christian');
  });
});

describe('obra', () => {
  it('reconoce el trabajo por el título, sin confundir comprar o cotizar con obra', () => {
    expect(familiaDeObra('Cableado de biblioteca')).toBe('Cableado');
    expect(familiaDeObra('Instalación de tubería')).toBe('Tubería');
    expect(familiaDeObra('Peinado de cable')).toBe('Peinado de rack');
    expect(familiaDeObra('Revisar reporte')).toBe('Otra obra');
    expect(esDeObra({ coreKind: 'obra', titulo: 'Lo que sea' })).toBe(true);
    expect(esDeObra({ coreKind: 'tarea', ticketTypeCustom: 'Instalación', titulo: 'Rack' })).toBe(true);
    expect(esDeObra({ coreKind: 'tarea', titulo: 'Cableado biblioteca' })).toBe(true);
    expect(esDeObra({ coreKind: 'comercial', titulo: 'Cotizar tubería' })).toBe(false);
    expect(esDeObra({ coreKind: 'tarea', titulo: 'Comprar cable' })).toBe(false);
    expect(esDeObra({ coreKind: 'tarea', titulo: 'Reporte mensual' })).toBe(false);
  });

  it('junta por tipo con la mediana y por sitio con lo que se repite en el título', () => {
    const f = (id: number, titulo: string, minutos: number, calculadoMin: number | null = 300, projectId: number | null = null) => ({
      id, titulo, coreKind: 'tarea', ticketTypeCustom: null, projectId, minutos, calculadoMin,
    });
    const r = armarObra([
      f(1, 'Cableado biblioteca Tlaxcala', 400),
      f(2, 'Cableado de biblioteca', 500),
      f(3, 'Instalación de tubería biblioteca', 480, 480, 9),
      f(4, 'Instalación en oficina', 60, null),
    ]);
    expect(r).toMatchObject({ actividades: 4, ligadas: 1, minutos: 1440 });
    expect(r.porTipo.find((t) => t.tipo === 'Cableado')).toEqual({ tipo: 'Cableado', veces: 2, realMin: 450, calculadoMin: 300 });
    expect(r.porSitio).toEqual([{ sitio: 'Biblioteca', actividades: 3, minutos: 1380, sinProyecto: [1, 2] }]);
  });

  it('por sitio no toma palabras de trabajo que se repiten en los títulos', () => {
    const fila = (id: number, titulo: string) => ({ id, titulo, coreKind: 'tarea', ticketTypeCustom: null, projectId: null, minutos: 60, calculadoMin: null });
    const r = armarObra([
      fila(1, 'Montado de tubería en Biblioteca'),
      fila(2, 'montado de tubería en planta baja'),
      fila(3, 'Peinado de cable en Site y colocación de registros'),
      fila(4, 'Peinado de cable en Site y colocación de registros para cámaras exteriores'),
      fila(5, 'Instalación antena tienda MAJA'),
      fila(6, 'Instalación amplificador en MAJA'),
    ]);
    expect(r.porSitio.map((s) => s.sitio)).toEqual(['Maja']);
  });

  it('Obra la abren dirección, coordinación de operaciones y el arquitecto', () => {
    expect(puedeVerObra('arquitecto', false)).toBe(true);
    expect(puedeVerObra('coord_operaciones', false)).toBe(true);
    expect(puedeVerObra('ing_campo', false)).toBe(false);
    expect(puedeVerObra('ing_campo', true)).toBe(true);
  });
});
