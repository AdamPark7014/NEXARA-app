/**
 * «¿Ya existe este cliente?» en código: lo que Adam pidió (BUAP en las dos direcciones, siglas,
 * acentos, «S.A. de C.V.» y errores de dedo) sin avisar de más.
 */
import { clientesParecidos, nucleoDelNombre } from './clientes-parecidos.js';

const PADRON = [
  { id: 1, name: 'BUAP' },
  { id: 2, name: 'Grupo Dice Puebla' },
  { id: 3, name: 'ANFORA' },
  { id: 4, name: 'Creppes and Waffles' },
  { id: 5, name: 'Coatzacoalcos' },
  { id: 6, name: 'Hotel Portal de Analco', legalName: 'Operadora Hotelera Portal de Analco, S.A. de C.V.' },
  { id: 7, name: 'Farmacias del Portal' },
  { id: 8, name: 'IPADE' },
  { id: 9, name: 'TEKSERVE', legalName: 'TEKSERVE MEXICO', taxId: 'TME010101AB1' },
  { id: 10, name: 'Joi Dolar' },
  { id: 11, name: 'Colegio Vallarta' },
  { id: 12, name: 'Petróleos Mexicanos' },
];

const parecidos = (nombre: string, extra: Record<string, unknown> = {}) => clientesParecidos({ nombre, ...extra }, PADRON);
const nombres = (nombre: string, extra: Record<string, unknown> = {}) => parecidos(nombre, extra).map((p) => p.cliente.name);

describe('nucleoDelNombre', () => {
  it.each([
    ['Colegio Bosques de Zavaleta, A.C.', 'colegio bosques de zavaleta'],
    ['Logística Integral del Centro, S.A. de C.V.', 'logistica integral del centro'],
    ['Servicios Médicos Santa Lucía de Puebla, S.C.', 'servicios medicos santa lucia de puebla'],
    ['Comercial del Sur S. de R.L. de C.V.', 'comercial del sur'],
    ['Grupo Bimbo, S.A.B. de C.V.', 'grupo bimbo'],
    ['ACME SAPI de CV', 'acme'],
    ['B.U.A.P.', 'buap'],
    ['Crepes & Waffles', 'crepes y waffles'],
  ])('%s → %s', (entrada, salida) => {
    expect(nucleoDelNombre(entrada)).toBe(salida);
  });

  it('un nombre que es solo la forma jurídica no se queda vacío', () => {
    expect(nucleoDelNombre('S.A.')).toBe('sa');
  });
});

describe('BUAP, el caso de Adam', () => {
  it('de nombre completo a siglas', () => {
    const [p] = parecidos('Benemérita Universidad Autónoma de Puebla');
    expect(p.cliente.name).toBe('BUAP');
    expect(p.motivo).toBe('siglas');
    expect(p.confianza).toBe('alta');
  });

  it('de siglas a nombre completo', () => {
    const padron = [{ id: 1, name: 'Benemérita Universidad Autónoma de Puebla' }];
    const [p] = clientesParecidos({ nombre: 'BUAP' }, padron);
    expect(p.cliente.id).toBe(1);
    expect(p.motivo).toBe('siglas');
    expect(clientesParecidos({ nombre: 'B.U.A.P.' }, padron)[0].motivo).toBe('siglas');
  });

  it('sin acentos, en minúsculas y con puntos', () => {
    expect(nombres('benemerita universidad autonoma de puebla')).toEqual(['BUAP']);
    expect(nombres('b.u.a.p.')).toEqual(['BUAP']);
    expect(nombres('buap')).toEqual(['BUAP']);
  });

  it('un nombre a medias del padrón también avisa', () => {
    const padron = [{ id: 1, name: 'BUAP' }, { id: 2, name: 'Benemer' }];
    expect(clientesParecidos({ nombre: 'Benemérita Universidad Autónoma de Puebla' }, padron).map((p) => p.cliente.name)).toEqual(['BUAP', 'Benemer']);
  });

  it('las siglas que casi coinciden se ofrecen, sin darlas por seguras', () => {
    const [p] = parecidos('Universidad Autónoma de Puebla');
    expect(p.cliente.name).toBe('BUAP');
    expect(p.confianza).toBe('media');
  });
});

describe('formas de escribir', () => {
  it('forma jurídica y razón social', () => {
    expect(parecidos('Colegio Vallarta, S.C.')[0].motivo).toBe('mismo-nombre');
    expect(parecidos('Operadora Hotelera Portal de Analco')[0].cliente.name).toBe('Hotel Portal de Analco');
    expect(parecidos('Tekserve México S.A. de C.V.')[0].cliente.name).toBe('TEKSERVE');
  });

  it('errores de dedo y de oído', () => {
    expect(nombres('Cuatzacualcos')).toEqual(['Coatzacoalcos']);
    expect(nombres('Crepes & Waffles')).toEqual(['Creppes and Waffles']);
    expect(nombres('Joy Dolar')).toEqual(['Joi Dolar']);
    expect(nombres('Ánfora')).toEqual(['ANFORA']);
  });

  it('a medio escribir, en las dos direcciones', () => {
    expect(nombres('ANFO')).toEqual(['ANFORA']);
    expect(clientesParecidos({ nombre: 'ANFORA' }, [{ id: 1, name: 'ANFO' }])[0].motivo).toBe('a-medio-escribir');
  });

  it('palabras que faltan', () => {
    expect(nombres('Grupo Dice')).toEqual(['Grupo Dice Puebla']);
    expect(nombres('Vallarta')).toEqual(['Colegio Vallarta']);
  });

  it('forma corta por sílabas', () => {
    expect(parecidos('Pemex')[0].motivo).toBe('silabas');
  });

  it('siglas con las palabras completas de un instituto', () => {
    expect(parecidos('Instituto Panamericano de Alta Dirección de Empresa')[0].cliente.name).toBe('IPADE');
  });

  it('el mismo RFC, sin importar el nombre', () => {
    expect(parecidos('Otro nombre comercial', { rfc: 'tme-010101-ab1' })[0].motivo).toBe('rfc');
  });

  it('el RFC genérico del SAT no identifica a nadie', () => {
    const padron = [{ id: 1, name: 'Mostrador', taxId: 'XAXX010101000' }];
    expect(clientesParecidos({ nombre: 'Público', rfc: 'XAXX010101000' }, padron)).toEqual([]);
  });
});

describe('no avisa de más', () => {
  it.each([
    'Toks',
    'Sephora',
    'Grupo Modelo',
    'Colegio Americano',
    'Hotel Presidente',
    'Universidad Anáhuac',
    'UPAEP',
    'Puebla',
    'Serta Colchones',
    'Farmacias Guadalajara',
    'Tecnológico de Puebla',
  ])('%s es nuevo', (nombre) => {
    expect(parecidos(nombre)).toEqual([]);
  });

  it('dos giros distintos no son el mismo aunque compartan palabra', () => {
    expect(nombres('Hotel Las Palmas del Portal')).not.toContain('Farmacias del Portal');
    expect(nombres('Clínica del Portal')).toEqual([]);
  });

  it('con uno casi seguro no estorban unas siglas que apenas se parecen', () => {
    const padron = [
      { id: 1, name: 'UDLAP' },
      { id: 2, name: 'BUAP' },
    ];
    expect(clientesParecidos({ nombre: 'Universidad de las Américas Puebla' }, padron).map((p) => p.cliente.name)).toEqual(['UDLAP']);
  });

  it('un cliente no se avisa contra sí mismo', () => {
    expect(clientesParecidos({ nombre: 'BUAP', excluirId: 1 }, PADRON)).toEqual([]);
  });

  it('el nombre vacío no compara', () => {
    expect(clientesParecidos({ nombre: '   ' }, PADRON)).toEqual([]);
  });
});
