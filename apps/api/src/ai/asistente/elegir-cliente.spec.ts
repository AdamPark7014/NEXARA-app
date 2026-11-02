import { catalogoRelevante, construirPropuesta, type AccionPlan, type CatalogosNexara } from './asistente-actividades';
import { elegirCliente, mismoNombreDeCliente } from './elegir-cliente';

const CLIENTES = [
  { id: 1, name: 'BUAP' },
  { id: 2, name: 'SERTE' },
  { id: 3, name: 'Grupo Dice Puebla' },
  { id: 4, name: 'IBERO PUEBLA' },
  { id: 5, name: 'Hotel Portal de Analco' },
  { id: 6, name: 'Farmacias del Portal' },
  { id: 7, name: 'N10', legalName: 'Nivel 10 Consulting' },
  { id: 8, name: 'TEKSERVE' },
  { id: 9, name: 'Grupo Tox' },
  { id: 10, name: 'Clínica Santa Lucía' },
];

const elegido = (texto: string) => elegirCliente(texto, CLIENTES).elegido?.name ?? null;
const candidatos = (texto: string) => elegirCliente(texto, CLIENTES).candidatos.map((c) => c.name);

describe('elegirCliente', () => {
  it.each([
    ['Benemérita Universidad Autónoma de Puebla', 'BUAP'],
    ['B.U.A.P', 'BUAP'],
    ['be u a pe', 'BUAP'],
    ['TEK SERVE', 'TEKSERVE'],
    ['Hotel Portal', 'Hotel Portal de Analco'],
    ['Nivel 10 Consulting', 'N10'],
    ['Talks', 'Grupo Tox'],
    ['Talks nave 2', 'Grupo Tox'],
    ['Grupo Dice', 'Grupo Dice Puebla'],
  ])('«%s» es %s', (texto, nombre) => {
    expect(elegido(texto)).toBe(nombre);
  });

  it.each(['Serta Colchones', 'Sertec Ingeniería'])('«%s» apenas se parece a SERTE: se sugiere, no se elige', (texto) => {
    expect(elegido(texto)).toBeNull();
    expect(candidatos(texto)).toEqual(['SERTE']);
  });

  it.each(['Grupo Bimbo', 'Constructora Puebla', 'Clínica Santa Engracia', 'Farmacias Guadalajara'])(
    '«%s» solo comparte un giro o un lugar: ni se elige ni se sugiere',
    (texto) => {
      const r = elegirCliente(texto, CLIENTES);
      expect(r.elegido).toBeNull();
      expect(r.candidatos).toEqual([]);
      expect(r.empatados).toEqual([]);
    },
  );

  it('dice cuando eligió el comparador y no el parecido letra por letra', () => {
    expect(elegirCliente('Nivel 10 Consulting', CLIENTES).porComparador).toBe(true);
    expect(elegirCliente('Grupo Dice', CLIENTES).porComparador).toBe(false);
  });

  it('sin texto no hay nada que elegir', () => {
    expect(elegirCliente(null, CLIENTES)).toEqual({ elegido: null, candidatos: [], empatados: [], porComparador: false });
    expect(elegirCliente('  ', CLIENTES).elegido).toBeNull();
  });

  it('el mismo nombre salvo puntos, espacios o la forma jurídica', () => {
    expect(mismoNombreDeCliente('TEK SERVE', 'TEKSERVE')).toBe(true);
    expect(mismoNombreDeCliente('B.U.A.P', 'BUAP')).toBe(true);
    expect(mismoNombreDeCliente('Serte SA de CV', 'SERTE')).toBe(true);
    expect(mismoNombreDeCliente('Nivel Diez', 'N10')).toBe(false);
  });
});

describe('lo que se le manda a la IA', () => {
  const catalogos: CatalogosNexara = { personas: [], clientes: CLIENTES, sucursales: [], proyectos: [] };
  const mandados = (instruccion: string) => catalogoRelevante(instruccion, catalogos).clientes.map((c) => c.name);

  it.each(['revisar las cámaras de Constructora Puebla', 'cotizar para Grupo Bimbo', 'ir a la Clínica Santa Engracia'])(
    '«%s» no le manda a nadie que solo comparta un giro o un lugar',
    (instruccion) => {
      expect(mandados(instruccion)).toEqual([]);
    },
  );

  it.each([
    ['revisar las cámaras de ibero puebla', 'IBERO PUEBLA'],
    ['junta con talks a las 3', 'Grupo Tox'],
    ['que termine lo de la be u a pe', 'BUAP'],
    ['ir a la clínica santa lucía', 'Clínica Santa Lucía'],
  ])('«%s» sí le manda a %s', (instruccion, nombre) => {
    expect(mandados(instruccion)).toContain(nombre);
  });
});

describe('la tarjeta con estos clientes', () => {
  const catalogos: CatalogosNexara = { personas: [], clientes: CLIENTES, sucursales: [], proyectos: [] };
  const propuesta = (cliente: string, tipo: AccionPlan['tipo'] = 'servicio') =>
    construirPropuesta(
      {
        tipo,
        subtipo: tipo === 'servicio' ? 'CORRECTIVO' : null,
        titulo: 'Revisar cámaras',
        indicaciones: null,
        responsable: null,
        cliente,
        sitio: null,
        fecha: null,
        hora: null,
        fechaLimite: null,
        horaLimite: null,
        duracionMin: null,
        prioridad: 'Media',
        encargo: null,
      },
      catalogos,
      { creadoPorId: 1, ahora: new Date('2026-11-02T16:00:00Z'), instruccion: `Revisar las cámaras de ${cliente}` },
    );

  it.each(['Grupo Bimbo', 'Constructora Puebla', 'Colegio Americano'])('«%s» se ofrece como cliente nuevo', (nombre) => {
    const p = propuesta(nombre);
    expect(p.cliente).toBeNull();
    expect(p.clienteCandidatos).toEqual([]);
    expect(p.clienteNuevo).toBe(nombre);
  });

  it('«Serta Colchones» no se va a SERTE: lo sugiere y no da de alta sin que alguien lo decida', () => {
    const p = propuesta('Serta Colchones');
    expect(p.cliente).toBeNull();
    expect(p.clienteCandidatos.map((c) => c.nombre)).toEqual(['SERTE']);
    expect(p.clienteNuevo).toBeNull();
  });

  it('lo que el comparador resuelve se marca como corregido', () => {
    const p = propuesta('Nivel 10 Consulting');
    expect(p.cliente?.nombre).toBe('N10');
    expect(p.correcciones).toContainEqual({ campo: 'cliente', de: 'Nivel 10 Consulting', a: 'N10', como: 'parecido' });
  });

  it('un nombre que solo cambia en puntos o espacios no se marca como corregido', () => {
    const p = propuesta('TEK SERVE');
    expect(p.cliente?.nombre).toBe('TEKSERVE');
    expect(p.correcciones.filter((c) => c.campo === 'cliente')).toEqual([]);
  });
});
